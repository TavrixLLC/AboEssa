import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActorType,
  CommissionStatus,
  OrderItemStatus,
  OrderStatus,
  Prisma,
  ProductListingStatus,
  ShipmentStatus,
  ShippingRequestStatus,
} from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { hasDeliveryAddress } from 'src/checkout/delivery-address';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { AppException } from 'src/common/exceptions/app.exception';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SocketsService } from 'src/sockets/sockets.service';
import { WalletService } from 'src/wallet/wallet.service';
import { hashRequestMetadata } from 'src/common/security/hash.util';
import { ConsoleOrderActionDto, ConsoleOrdersQueryDto } from './console.dto';
import { InventoryLedger, inventoryRetryable } from 'src/inventory/inventory-ledger';

const customerSelect = {
  id: true,
  displayName: true,
  phone: true,
  status: true,
  notes: true,
  createdAt: true,
} satisfies Prisma.CustomerSelect;
const orderInclude = {
  customer: { select: customerSelect },
  items: { orderBy: { id: 'asc' as const } },
  shipments: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.OrderInclude;
type ConsoleOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
const confirmedWhere: Prisma.OrderWhereInput = {
  items: { some: { checkoutConfirmedAt: { not: null } } },
};

@Injectable()
export class AdminConsoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly audit: AuditLogsService,
    private readonly sockets: SocketsService,
    private readonly notifications: NotificationsService,
  ) {}

  async overview(actor: AuthenticatedUser) {
    const day = new Date(Date.now() + 3 * 3600000);
    const today = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) - 3 * 3600000,
    );
    const canOrders =
      actor.isOwner ||
      actor.role === 'OWNER' ||
      actor.permissions?.includes(PERMISSIONS.SHIPPING_MANAGE);
    const [newOrders, activeAuctions, sales, completed, attention] = await Promise.all([
      this.prisma.order.count({
        where: { ...confirmedWhere, status: OrderStatus.SHIPPING_REQUESTED },
      }),
      this.prisma.auction.count({ where: { status: 'ACTIVE', endsAt: { gt: new Date() } } }),
      this.prisma.order.aggregate({
        where: {
          ...confirmedWhere,
          status: { not: OrderStatus.CANCELLED },
          createdAt: { gte: today },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.count({
        where: { ...confirmedWhere, status: OrderStatus.DELIVERED, deliveredAt: { gte: today } },
      }),
      canOrders
        ? this.prisma.order.findMany({
            where: {
              ...confirmedWhere,
              status: { in: [OrderStatus.SHIPPING_REQUESTED, OrderStatus.PACKING] },
            },
            include: orderInclude,
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: 5,
          })
        : Promise.resolve([]),
    ]);
    return {
      newOrders,
      activeAuctions,
      salesToday: sales._sum.totalAmount?.toFixed(2) ?? '0.00',
      completedToday: completed,
      attention: await this.withRequests(attention),
    };
  }

  async orders(query: ConsoleOrdersQueryDto) {
    const page = getPagination(query);
    const where: Prisma.OrderWhereInput = { ...confirmedWhere };
    const states: Record<string, Prisma.OrderWhereInput> = {
      NEW: { status: OrderStatus.SHIPPING_REQUESTED },
      PREPARING: {
        status: OrderStatus.PACKING,
        items: { some: { status: { not: OrderItemStatus.PACKED } } },
      },
      READY: { status: OrderStatus.PACKING, items: { every: { status: OrderItemStatus.PACKED } } },
      SHIPPED: { status: OrderStatus.SHIPPED },
      DELIVERED: { status: OrderStatus.DELIVERED },
      CANCELLED: { status: OrderStatus.CANCELLED },
    };
    where.AND = [confirmedWhere, ...(query.state ? [states[query.state]] : [])];
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { customer: { displayName: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search } } },
        { items: { some: { title: { contains: search, mode: 'insensitive' } } } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.order.count({ where }),
    ]);
    return toPaginatedResult(await this.withRequests(items), total, page.page, page.limit);
  }

  async order(id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, ...confirmedWhere },
      include: orderInclude,
    });
    if (!order)
      throw new AppException('Order was not found', 'ORDER_NOT_FOUND', HttpStatus.NOT_FOUND);
    return (await this.withRequests([order]))[0];
  }

  async customer(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        ...customerSelect,
        deletedAt: true,
        totalPurchasedAmount: true,
        totalCancelledAmount: true,
        addresses: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        },
      },
    });
    if (!customer || customer.deletedAt)
      throw new AppException('Customer was not found', 'CUSTOMER_NOT_FOUND', HttpStatus.NOT_FOUND);
    const [wallet, orders, bids] = await Promise.all([
      this.wallet.getForCustomer(id),
      this.prisma.order.findMany({
        where: { ...confirmedWhere, customerId: id },
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.bid.findMany({
        where: { customerId: id },
        select: {
          id: true,
          amount: true,
          status: true,
          placedAt: true,
          auction: { select: { id: true, title: true, endsAt: true, imageUrls: true } },
        },
        orderBy: { placedAt: 'desc' },
        take: 30,
      }),
    ]);
    return { ...customer, wallet, orders: await this.withRequests(orders), bids };
  }

  async changeOrder(id: string, dto: ConsoleOrderActionDto, adminId: string, request: Request) {
    const result = await this.prisma
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
          const order = await tx.order.findFirst({
            where: { id, ...confirmedWhere },
            include: { items: true },
          });
          if (!order)
            throw new AppException('Order was not found', 'ORDER_NOT_FOUND', HttpStatus.NOT_FOUND);
          const ids = order.items.map((item) => item.id);
          const shipments = await tx.shipmentRequest.findMany({
            where: {
              customerId: order.customerId,
              requestedItemIds: { hasSome: ids },
              status: { not: ShippingRequestStatus.CANCELLED },
            },
          });
          if (
            shipments.some((shipment) =>
              shipment.requestedItemIds.some((itemId) => !ids.includes(itemId)),
            )
          )
            throw new AppException(
              'Combined shipment must be managed together',
              'ORDER_SHIPMENT_CONFLICT',
              HttpStatus.CONFLICT,
            );
          const state = this.orderState(order);
          const target = {
            PREPARE: 'PREPARING',
            READY: 'READY',
            SHIP: 'SHIPPED',
            DELIVER: 'DELIVERED',
            CANCEL: 'CANCELLED',
          }[dto.action];
          if (state === target) return { customerId: order.customerId, changed: false };
          const allowed: Record<string, string[]> = {
            NEW: ['PREPARE', 'CANCEL'],
            PREPARING: ['READY', 'CANCEL'],
            READY: ['SHIP', 'CANCEL'],
            SHIPPED: ['DELIVER'],
            DELIVERED: [],
            CANCELLED: [],
          };
          if (!allowed[state]?.includes(dto.action))
            throw new AppException(
              'Invalid order status transition',
              'INVALID_ORDER_TRANSITION',
              HttpStatus.CONFLICT,
            );
          // Stable product lock order before wallet/customer locks. The hook
          // remains enforced for mapped products even if management is disabled.
          for (const productId of [
            ...new Set(
              order.items.flatMap((i) => (i.productListingId ? [i.productListingId] : [])),
            ),
          ].sort())
            await InventoryLedger.lockProduct(tx, productId);
          if (
            dto.action !== 'CANCEL' &&
            dto.action !== 'DELIVER' &&
            (!shipments.length ||
              shipments.some((shipment) => !hasDeliveryAddress(shipment.addressSnapshot)))
          ) {
            throw new AppException(
              'A delivery address is required before preparation or shipping',
              'DELIVERY_ADDRESS_REQUIRED',
              HttpStatus.CONFLICT,
            );
          }
          const now = new Date();
          if (dto.action === 'PREPARE') {
            await tx.order.update({ where: { id }, data: { status: OrderStatus.PACKING } });
            await tx.shipmentRequest.updateMany({
              where: { id: { in: shipments.map((item) => item.id) } },
              data: { status: ShippingRequestStatus.APPROVED, approvedAt: now },
            });
          } else if (dto.action === 'READY') {
            await tx.orderItem.updateMany({
              where: { id: { in: ids } },
              data: { status: OrderItemStatus.PACKED },
            });
            await tx.shipmentRequest.updateMany({
              where: { id: { in: shipments.map((item) => item.id) } },
              data: { status: ShippingRequestStatus.PACKING, packedAt: now },
            });
          } else if (dto.action === 'SHIP') {
            if (!dto.shippingCompany?.trim())
              throw new AppException(
                'Shipping company is required',
                'SHIPPING_COMPANY_REQUIRED',
                HttpStatus.BAD_REQUEST,
              );
            await InventoryLedger.settleItems(tx, order.items, id, 'SHIP', adminId);
            await tx.order.update({
              where: { id },
              data: { status: OrderStatus.SHIPPED, shippedAt: now },
            });
            await tx.orderItem.updateMany({
              where: { id: { in: ids } },
              data: { status: OrderItemStatus.SHIPPED },
            });
            await tx.shipmentRequest.updateMany({
              where: { id: { in: shipments.map((item) => item.id) } },
              data: {
                status: ShippingRequestStatus.SHIPPED,
                shippedAt: now,
                shippingCompany: dto.shippingCompany.trim(),
                trackingNumber: dto.trackingNumber?.trim() || null,
                shippingPrice: dto.shippingPrice,
              },
            });
            await tx.shipment.create({
              data: {
                customerId: order.customerId,
                orderId: id,
                itemIds: ids,
                status: ShipmentStatus.SHIPPED,
                shippedAt: now,
                shippingCompany: dto.shippingCompany.trim(),
                trackingNumber: dto.trackingNumber?.trim() || null,
                shippingPrice: dto.shippingPrice,
              },
            });
          } else if (dto.action === 'DELIVER') {
            await tx.order.update({
              where: { id },
              data: { status: OrderStatus.DELIVERED, deliveredAt: now },
            });
            await tx.orderItem.updateMany({
              where: { id: { in: ids } },
              data: { status: OrderItemStatus.DELIVERED },
            });
            await tx.shipment.updateMany({
              where: { orderId: id },
              data: { status: ShipmentStatus.DELIVERED, deliveredAt: now },
            });
          } else {
            if (!dto.reason?.trim())
              throw new AppException(
                'Cancellation reason is required',
                'CANCELLATION_REASON_REQUIRED',
                HttpStatus.BAD_REQUEST,
              );
            const paid = order.items.reduce(
              (sum, item) => sum.plus(item.walletPaidAmount),
              new Prisma.Decimal(0),
            );
            await InventoryLedger.settleItems(tx, order.items, id, 'REVERSE', adminId);
            if (paid.greaterThan(0))
              await this.wallet.refundPurchase(tx, order.customerId, paid, id);
            await tx.order.update({
              where: { id },
              data: { status: OrderStatus.CANCELLED, cancelledAt: now, notes: dto.reason.trim() },
            });
            await tx.orderItem.updateMany({
              where: { id: { in: ids } },
              data: { status: OrderItemStatus.CANCELLED, cancelledAt: now },
            });
            await tx.shipmentRequest.updateMany({
              where: { id: { in: shipments.map((item) => item.id) } },
              data: {
                status: ShippingRequestStatus.CANCELLED,
                cancelledAt: now,
                adminNote: dto.reason.trim(),
              },
            });
            await tx.customer.update({
              where: { id: order.customerId },
              data: { totalCancelledAmount: { increment: order.totalAmount } },
            });
            await tx.customerBox.updateMany({
              where: {
                customerId: order.customerId,
                totalItems: { gte: order.items.length },
                totalAmount: { gte: order.totalAmount },
              },
              data: {
                totalItems: { decrement: order.items.length },
                totalAmount: { decrement: order.totalAmount },
              },
            });
            const productIds = new Set(
              order.items.flatMap((item) => (item.productListingId ? [item.productListingId] : [])),
            );
            for (const productId of productIds) {
              const count = order.items.filter(
                (item) => item.productListingId === productId,
              ).length;
              const product = await tx.productListing.findUnique({ where: { id: productId } });
              if (product)
                await tx.productListing.update({
                  where: { id: productId },
                  data: {
                    availableQuantity: { increment: count },
                    soldQuantity: { decrement: count },
                    status:
                      product.status === ProductListingStatus.SOLD
                        ? ProductListingStatus.ACTIVE
                        : product.status,
                  },
                });
            }
            await tx.commissionLedger.updateMany({
              where: {
                orderItemId: { in: ids },
                status: { in: [CommissionStatus.PENDING, CommissionStatus.APPROVED] },
              },
              data: {
                status: CommissionStatus.CANCELLED,
                cancelledAt: now,
                reason: dto.reason.trim(),
              },
            });
          }
          await tx.auditLog.create({
            data: {
              actorType: ActorType.ADMIN,
              actorId: adminId,
              action: `order.${dto.action.toLowerCase()}`,
              entityType: 'Order',
              entityId: id,
              metadata: { reason: dto.reason ?? null },
              ipHash: hashRequestMetadata(request.ip),
              userAgentHash: hashRequestMetadata(request.headers['user-agent']),
            },
          });
          return { customerId: order.customerId, changed: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error: unknown) => {
        if (inventoryRetryable(error))
          throw new AppException(
            'Order changed concurrently; retry the same action',
            'ORDER_CONFLICT_RETRY',
            HttpStatus.CONFLICT,
          );
        throw error;
      });
    if (result.changed) {
      this.sockets.emitToAdmins('order_updated', { orderId: id });
      this.sockets.emitToCustomer(result.customerId, 'order_updated', { orderId: id });
      await this.notifications.createForCustomer({
        customerId: result.customerId,
        type: 'ORDER_UPDATED',
        title: 'تحديث طلبك',
        body: (
          {
            PREPARE: 'بدأ تجهيز طلبك',
            READY: 'طلبك جاهز للتوصيل',
            SHIP: 'تم شحن طلبك',
            DELIVER: 'تم تسليم طلبك',
            CANCEL: 'تم إلغاء طلبك وإرجاع المبلغ المدفوع إلى المحفظة',
          } as Record<string, string>
        )[dto.action],
        data: { orderId: id },
      });
    }
    return this.order(id);
  }

  private orderState(order: { status: OrderStatus; items: { status: OrderItemStatus }[] }) {
    if (order.status === OrderStatus.SHIPPING_REQUESTED) return 'NEW';
    if (order.status === OrderStatus.PACKING)
      return order.items.length &&
        order.items.every((item) => item.status === OrderItemStatus.PACKED)
        ? 'READY'
        : 'PREPARING';
    return order.status;
  }

  private async withRequests(orders: ConsoleOrder[]) {
    const ids = orders.flatMap((order) => order.items.map((item) => item.id));
    const requests = ids.length
      ? await this.prisma.shipmentRequest.findMany({
          where: { requestedItemIds: { hasSome: ids } },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    return orders.map((order) => {
      const itemIds = new Set(order.items.map((item) => item.id));
      const shipping = requests.find((item) =>
        item.requestedItemIds.some((itemId) => itemIds.has(itemId)),
      );
      const paid = order.items.reduce(
        (sum, item) => sum.plus(item.walletPaidAmount),
        new Prisma.Decimal(0),
      );
      const due = order.items.reduce(
        (sum, item) => sum.plus(item.cashDueAmount),
        new Prisma.Decimal(0),
      );
      return {
        ...order,
        displayState: this.orderState(order),
        walletPaidAmount: paid.toFixed(2),
        cashDueAmount: due.toFixed(2),
        paymentMethod: order.items[0]?.paymentMethod ?? null,
        source: order.items.some((item) => item.auctionId) ? 'AUCTION' : 'PRODUCT',
        delivery: shipping?.addressSnapshot ?? order.items[0]?.deliveryAddressSnapshot ?? null,
        needsAddress: !hasDeliveryAddress(
          shipping?.addressSnapshot ?? order.items[0]?.deliveryAddressSnapshot,
        ),
        shippingRequest: shipping ?? null,
      };
    });
  }
}
