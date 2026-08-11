import { HttpStatus, Injectable } from '@nestjs/common';
import { ActorType, LabelStatus, OrderItemStatus, Prisma } from '@prisma/client';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { APP_SETTINGS_ID } from 'src/common/constants/app.constants';
import { AppException } from 'src/common/exceptions/app.exception';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { LabelsService } from 'src/labels/labels.service';
import { CustomerBoxQueryDto } from 'src/warehouse/dto/customer-box-query.dto';
import { ItemSearchQueryDto } from 'src/warehouse/dto/item-search-query.dto';
import { WarehouseLabelPendingQueryDto } from 'src/warehouse/dto/warehouse-label-pending-query.dto';
import { PrismaService } from 'src/prisma/prisma.service';

const boxItemStatuses = [
  OrderItemStatus.SOLD,
  OrderItemStatus.IN_CUSTOMER_BOX,
  OrderItemStatus.SHIPPING_REQUESTED,
  OrderItemStatus.PACKED,
];

@Injectable()
export class WarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labelsService: LabelsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async labelPending(query: WarehouseLabelPendingQueryDto) {
    const pagination = getPagination(query);
    const settings = await this.getSettings();
    const where: Prisma.OrderItemWhereInput = {
      labelStatus: LabelStatus.PENDING,
      status: { in: [OrderItemStatus.IN_CUSTOMER_BOX, OrderItemStatus.SOLD] },
      source: query.source,
      categoryId: query.categoryId,
      customerId: query.customerId,
      soldAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
      OR: query.search
        ? [
            { barcode: { contains: query.search, mode: 'insensitive' } },
            { title: { contains: query.search, mode: 'insensitive' } },
            { customer: { displayName: { contains: query.search, mode: 'insensitive' } } },
            { customer: { phone: { contains: query.search } } },
          ]
        : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.orderItem.findMany({
        where,
        include: { customer: true, category: true },
        orderBy: { soldAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.orderItem.count({ where }),
    ]);

    return toPaginatedResult(
      items.map((item) => ({
        orderItemId: item.id,
        barcode: item.barcode,
        imageUrl: item.imageUrl,
        snapshotUrl: item.snapshotUrl,
        customer: {
          id: item.customer.id,
          displayName: item.customer.displayName,
          phone: item.customer.phone,
        },
        price: Number(item.price),
        currency: settings.currency,
        category: item.category ? { id: item.category.id, name: item.category.name } : null,
        source: item.source,
        soldAt: item.soldAt,
        labelStatus: item.labelStatus,
        flags: {
          isBroken: item.isBroken,
          isGift: item.isGift,
          isReplacement: item.isReplacement,
        },
      })),
      total,
      pagination.page,
      pagination.limit,
    );
  }

  async printLabel(orderItemId: string, adminId: string) {
    const item = await this.prisma.orderItem.findUnique({ where: { id: orderItemId } });
    if (!item) {
      throw new AppException('Order item was not found', 'ORDER_ITEM_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (item.status === OrderItemStatus.CANCELLED) {
      throw new AppException('Cancelled item cannot be printed', 'ORDER_ITEM_CANCELLED', HttpStatus.CONFLICT);
    }
    if (item.labelStatus === LabelStatus.ATTACHED) {
      throw new AppException('Label is already attached', 'LABEL_ALREADY_ATTACHED', HttpStatus.CONFLICT);
    }

    const job = await this.labelsService.createPrintJob(orderItemId, adminId);
    const labelPayload = await this.labelsService.createLabelPayload(orderItemId);

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'LABEL_PRINT_JOB_CREATED',
      entityType: 'LabelPrintJob',
      entityId: job.id,
      metadata: { orderItemId, barcode: item.barcode },
    });

    return { labelPrintJob: job, labelPayload };
  }

  async confirmLabelAttached(orderItemId: string, adminId: string) {
    const job = await this.labelsService.confirmAttachedByItem(orderItemId, adminId);
    const item = await this.prisma.orderItem.findUniqueOrThrow({
      where: { id: orderItemId },
      include: { customer: true, category: true },
    });
    return { item, labelPrintJob: job };
  }

  async customerBoxes(query: CustomerBoxQueryDto) {
    const pagination = getPagination(query);
    const orderBy =
      query.sort === 'totalAmount_desc'
        ? { totalAmount: 'desc' as const }
        : query.sort === 'totalItems_desc'
          ? { totalItems: 'desc' as const }
          : { lastItemAt: 'desc' as const };
    const where: Prisma.CustomerBoxWhereInput = {
      totalItems: query.minItems !== undefined ? { gte: query.minItems } : undefined,
      customer: {
        OR: query.search
          ? [
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { whatsappPhone: { contains: query.search } },
              { tiktokUsername: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
        orderItems:
          query.hasPendingLabels === true
            ? {
                some: {
                  labelStatus: LabelStatus.PENDING,
                  status: { in: boxItemStatuses },
                },
              }
            : query.hasPendingLabels === false
              ? {
                  none: {
                    labelStatus: LabelStatus.PENDING,
                    status: { in: boxItemStatuses },
                  },
                }
              : undefined,
      },
    };

    const [boxes, total] = await this.prisma.$transaction([
      this.prisma.customerBox.findMany({
        where,
        include: { customer: true },
        orderBy,
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.customerBox.count({ where }),
    ]);

    const items = await Promise.all(
      boxes.map(async (box) => {
        const [pendingLabelsCount, attachedLabelsCount, shippingRequestedCount] = await Promise.all([
          this.prisma.orderItem.count({
            where: { customerId: box.customerId, labelStatus: LabelStatus.PENDING, status: { in: boxItemStatuses } },
          }),
          this.prisma.orderItem.count({
            where: { customerId: box.customerId, labelStatus: LabelStatus.ATTACHED, status: { in: boxItemStatuses } },
          }),
          this.prisma.orderItem.count({
            where: { customerId: box.customerId, status: OrderItemStatus.SHIPPING_REQUESTED },
          }),
        ]);

        return {
          customer: {
            id: box.customer.id,
            displayName: box.customer.displayName,
            phone: box.customer.phone,
            status: box.customer.status,
            verificationStatus: box.customer.verificationStatus,
          },
          totalItems: box.totalItems,
          totalAmount: box.totalAmount,
          lastItemAt: box.lastItemAt,
          pendingLabelsCount,
          attachedLabelsCount,
          shippingRequestedCount,
        };
      }),
    );

    return toPaginatedResult(items, total, pagination.page, pagination.limit);
  }

  async customerBoxDetails(customerId: string) {
    const [customer, box, items] = await Promise.all([
      this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
      this.prisma.customerBox.upsert({
        where: { customerId },
        create: { customerId },
        update: {},
      }),
      this.prisma.orderItem.findMany({
        where: {
          customerId,
          status: { in: boxItemStatuses },
        },
        include: { category: true, order: true, printJobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { soldAt: 'desc' },
      }),
    ]);

    return {
      customer: {
        id: customer.id,
        displayName: customer.displayName,
        phone: customer.phone,
        status: customer.status,
        verificationStatus: customer.verificationStatus,
      },
      box,
      items,
      summary: {
        pendingLabelsCount: items.filter((item) => item.labelStatus === LabelStatus.PENDING).length,
        attachedLabelsCount: items.filter((item) => item.labelStatus === LabelStatus.ATTACHED).length,
        totalAmount: box.totalAmount,
        totalItems: box.totalItems,
      },
    };
  }

  async searchItems(query: ItemSearchQueryDto, adminId: string) {
    if (!query.barcode && !query.search) {
      throw new AppException('barcode or search is required', 'BAD_REQUEST', HttpStatus.BAD_REQUEST);
    }

    const item = await this.prisma.orderItem.findFirst({
      where: query.barcode
        ? { barcode: query.barcode }
        : {
            OR: [
              { barcode: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
              { customer: { displayName: { contains: query.search, mode: 'insensitive' } } },
            ],
          },
      include: {
        customer: true,
        order: true,
        category: true,
        printJobs: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { soldAt: 'desc' },
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'WAREHOUSE_ITEM_SEARCHED',
      entityType: 'OrderItem',
      entityId: item?.id,
      metadata: { barcode: query.barcode, search: query.search },
    });

    return item;
  }

  private async getSettings() {
    return this.prisma.appSettings.upsert({
      where: { id: APP_SETTINGS_ID },
      create: {
        id: APP_SETTINGS_ID,
        storeName: 'Single Store',
        currency: 'IQD',
        labelTemplate: {},
      },
      update: {},
    });
  }
}

