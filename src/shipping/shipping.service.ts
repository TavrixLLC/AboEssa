import { HttpStatus, Injectable } from '@nestjs/common';
import { InventoryLedger } from 'src/inventory/inventory-ledger';
import {
  ActorType,
  LabelStatus,
  NotificationType,
  OrderItemStatus,
  Prisma,
  ShippingRequestStatus,
  ShipmentStatus,
} from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { AppException } from 'src/common/exceptions/app.exception';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateShippingRequestDto } from 'src/shipping/dto/create-shipping-request.dto';
import { ShipRequestDto } from 'src/shipping/dto/ship-request.dto';
import { SocketsService } from 'src/sockets/sockets.service';

@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly notifications: NotificationsService,
    private readonly sockets: SocketsService,
  ) {}

  async createRequest(customerId: string, dto: CreateShippingRequestDto, request: Request) {
    const shippingRequest = await this.prisma.$transaction(async (tx) => {
      const settings = await tx.appSettings.findFirst();
      if (settings && !settings.shippingRequestEnabled) {
        throw new AppException(
          'Shipping requests are disabled',
          'SHIPPING_DISABLED',
          HttpStatus.CONFLICT,
        );
      }
      const address = await tx.customerAddress.findFirst({
        where: { id: dto.addressId, customerId, isActive: true },
      });
      if (!address)
        throw new AppException('Address was not found', 'ADDRESS_NOT_FOUND', HttpStatus.NOT_FOUND);

      const items = await tx.orderItem.findMany({ where: { id: { in: dto.itemIds } } });
      if (
        items.length !== dto.itemIds.length ||
        items.some((item) => item.customerId !== customerId)
      ) {
        throw new AppException(
          'Items must belong to the authenticated customer',
          'SHIPPING_ITEM_NOT_OWNED',
          HttpStatus.FORBIDDEN,
        );
      }
      const alreadyRequestedStatuses: OrderItemStatus[] = [
        OrderItemStatus.CANCELLED,
        OrderItemStatus.SHIPPED,
        OrderItemStatus.SHIPPING_REQUESTED,
        OrderItemStatus.PACKED,
      ];
      if (items.some((item) => alreadyRequestedStatuses.includes(item.status))) {
        throw new AppException(
          'One or more items are already requested for shipping',
          'SHIPPING_ITEM_ALREADY_REQUESTED',
          HttpStatus.CONFLICT,
        );
      }
      if (items.some((item) => item.labelStatus !== LabelStatus.ATTACHED)) {
        throw new AppException(
          'One or more items are not eligible for shipping',
          'SHIPPING_ITEM_NOT_ELIGIBLE',
          HttpStatus.CONFLICT,
        );
      }
      const conflicting = await tx.shipmentRequest.findFirst({
        where: {
          status: {
            in: [
              ShippingRequestStatus.REQUESTED,
              ShippingRequestStatus.APPROVED,
              ShippingRequestStatus.PACKING,
            ],
          },
          requestedItemIds: { hasSome: dto.itemIds },
        },
      });
      if (conflicting)
        throw new AppException(
          'One or more items are already requested for shipping',
          'SHIPPING_ITEM_ALREADY_REQUESTED',
          HttpStatus.CONFLICT,
        );

      const totalAmount = items.reduce((sum, item) => sum.plus(item.price), new Prisma.Decimal(0));
      const created = await tx.shipmentRequest.create({
        data: {
          customerId,
          addressId: dto.addressId,
          requestedItemIds: dto.itemIds,
          totalAmount,
          customerNote: dto.note,
          addressSnapshot: {
            id: address.id,
            fullName: address.fullName,
            phone: address.phone,
            governorate: address.governorate,
            city: address.city,
            addressLine: address.addressLine,
            nearestPoint: address.nearestPoint,
          },
          status: ShippingRequestStatus.REQUESTED,
        },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: dto.itemIds } },
        data: { status: OrderItemStatus.SHIPPING_REQUESTED },
      });
      return created;
    });

    await this.auditLogs.create({
      actorType: ActorType.CUSTOMER,
      actorId: customerId,
      action: 'shipping.request_created',
      entityType: 'ShipmentRequest',
      entityId: shippingRequest.id,
      metadata: { itemIds: dto.itemIds, addressId: dto.addressId },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    this.sockets.emitToAdmins('shipping_request_created', shippingRequest);
    return this.toResponse(shippingRequest);
  }

  async listCustomer(customerId: string) {
    const items = await this.prisma.shipmentRequest.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => this.toResponse(item));
  }

  getCustomer(customerId: string, id: string) {
    return this.prisma.shipmentRequest
      .findFirstOrThrow({ where: { id, customerId } })
      .then((item) => this.toResponse(item));
  }

  adminList() {
    return this.prisma.shipmentRequest
      .findMany({ include: { customer: true, address: true }, orderBy: { createdAt: 'desc' } })
      .then((items) => items.map((item) => this.toResponse(item)));
  }

  adminGet(id: string) {
    return this.prisma.shipmentRequest
      .findUniqueOrThrow({ where: { id }, include: { customer: true, address: true } })
      .then((item) => this.toResponse(item));
  }

  async approve(id: string, adminId: string, request: Request) {
    await this.assertLegacyRequest(id);
    return this.setStatus(id, ShippingRequestStatus.APPROVED, adminId, request);
  }

  async pack(id: string, adminId: string, request: Request) {
    await this.assertLegacyRequest(id);
    const req = await this.transition(id, ShippingRequestStatus.PACKING, { packedAt: new Date() });
    await this.prisma.orderItem.updateMany({
      where: { id: { in: req.requestedItemIds } },
      data: { status: OrderItemStatus.PACKED },
    });
    await this.afterAdminChange(req.customerId, id, adminId, 'shipping.packed', request);
    return this.toResponse(req);
  }

  async ship(id: string, dto: ShipRequestDto, adminId: string, request: Request) {
    await this.assertLegacyRequest(id);
    const result = await this.prisma.$transaction(async (tx) => {
      const req = await tx.shipmentRequest.findUniqueOrThrow({ where: { id } });
      this.assertTransition(req.status, ShippingRequestStatus.SHIPPED);
      const stockItems = await tx.orderItem.findMany({
        where: { id: { in: req.requestedItemIds } },
      });
      await InventoryLedger.settleItems(tx, stockItems, id, 'SHIP', adminId, 'ShipmentRequest');
      const shipment = await tx.shipment.create({
        data: {
          customerId: req.customerId,
          itemIds: req.requestedItemIds,
          shippingCompany: dto.shippingCompany,
          trackingNumber: dto.trackingNumber,
          shippingPrice: dto.shippingPrice,
          status: ShipmentStatus.SHIPPED,
          shippedAt: new Date(),
        },
      });
      await tx.shipmentRequest.update({
        where: { id },
        data: {
          status: ShippingRequestStatus.SHIPPED,
          shippingCompany: dto.shippingCompany,
          trackingNumber: dto.trackingNumber,
          shippingPrice: dto.shippingPrice,
          shippedAt: new Date(),
        },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: req.requestedItemIds } },
        data: { status: OrderItemStatus.SHIPPED },
      });
      return { req, shipment };
    });
    await this.afterAdminChange(result.req.customerId, id, adminId, 'shipping.shipped', request);
    this.sockets.emitToCustomer(result.req.customerId, 'shipment_updated', result.shipment);
    return { ...result, req: this.toResponse(result.req) };
  }

  async cancel(id: string, adminId: string, request: Request) {
    await this.assertLegacyRequest(id);
    const current = await this.prisma.shipmentRequest.findUniqueOrThrow({ where: { id } });
    if (current.status === ShippingRequestStatus.CANCELLED) return current;
    this.assertTransition(current.status, ShippingRequestStatus.CANCELLED);
    const req = await this.prisma.shipmentRequest.update({
      where: { id },
      data: { status: ShippingRequestStatus.CANCELLED, cancelledAt: new Date() },
    });
    await this.prisma.orderItem.updateMany({
      where: {
        id: { in: req.requestedItemIds },
        status: { in: [OrderItemStatus.SHIPPING_REQUESTED, OrderItemStatus.PACKED] },
      },
      data: { status: OrderItemStatus.IN_CUSTOMER_BOX },
    });
    await this.afterAdminChange(req.customerId, id, adminId, 'shipping.cancelled', request);
    return this.toResponse(req);
  }

  private async assertLegacyRequest(id: string) {
    const shipment = await this.prisma.shipmentRequest.findUniqueOrThrow({ where: { id } });
    const confirmed = await this.prisma.orderItem.findFirst({
      where: { id: { in: shipment.requestedItemIds }, checkoutConfirmedAt: { not: null } },
      select: { id: true },
    });
    if (confirmed)
      throw new AppException(
        'Manage confirmed purchases through order actions',
        'USE_ORDER_ACTIONS',
        HttpStatus.CONFLICT,
      );
  }

  private async setStatus(
    id: string,
    status: ShippingRequestStatus,
    adminId: string,
    request: Request,
  ) {
    const current = await this.prisma.shipmentRequest.findUniqueOrThrow({ where: { id } });
    if (current.status === status) return this.toResponse(current);
    this.assertTransition(current.status, status);
    const req = await this.prisma.shipmentRequest.update({
      where: { id },
      data: {
        status,
        approvedAt: status === ShippingRequestStatus.APPROVED ? new Date() : undefined,
      },
    });
    await this.afterAdminChange(
      req.customerId,
      id,
      adminId,
      `shipping.${status.toLowerCase()}`,
      request,
    );
    return this.toResponse(req);
  }

  private async transition(
    id: string,
    status: ShippingRequestStatus,
    extra: Prisma.ShipmentRequestUpdateInput = {},
  ) {
    const current = await this.prisma.shipmentRequest.findUniqueOrThrow({ where: { id } });
    if (current.status === status) return current;
    this.assertTransition(current.status, status);
    return this.prisma.shipmentRequest.update({ where: { id }, data: { status, ...extra } });
  }

  private assertTransition(from: ShippingRequestStatus, to: ShippingRequestStatus) {
    const allowed: Record<ShippingRequestStatus, ShippingRequestStatus[]> = {
      REQUESTED: [ShippingRequestStatus.APPROVED, ShippingRequestStatus.CANCELLED],
      APPROVED: [ShippingRequestStatus.PACKING, ShippingRequestStatus.CANCELLED],
      PACKING: [ShippingRequestStatus.SHIPPED, ShippingRequestStatus.CANCELLED],
      SHIPPED: [],
      CANCELLED: [],
    };
    if (!allowed[from].includes(to)) {
      throw new AppException(
        'Invalid shipping status transition',
        'INVALID_SHIPPING_STATUS_TRANSITION',
        HttpStatus.CONFLICT,
      );
    }
  }

  private toResponse(item: any) {
    return {
      ...item,
      itemIds: item.requestedItemIds ?? [],
      orderItems: item.requestedItemIds ?? [],
      note: item.customerNote ?? null,
      requestedAt: item.createdAt,
    };
  }

  private async afterAdminChange(
    customerId: string,
    requestId: string,
    adminId: string,
    action: string,
    request: Request,
  ) {
    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action,
      entityType: 'ShipmentRequest',
      entityId: requestId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    await this.notifications.createForCustomer({
      customerId,
      type: NotificationType.ORDER_UPDATED,
      title: 'Shipping updated',
      body: action,
      data: { shipmentRequestId: requestId },
    });
  }
}
