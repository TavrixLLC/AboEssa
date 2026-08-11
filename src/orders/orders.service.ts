import { Injectable } from '@nestjs/common';
import { LabelStatus, OrderItemStatus, OrderStatus, Prisma } from '@prisma/client';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { CustomerOrderItemsQueryDto } from 'src/order-items/dto/customer-order-items-query.dto';
import { PrismaService } from 'src/prisma/prisma.service';

const visibleCustomerItemStatuses = [
  OrderItemStatus.SOLD,
  OrderItemStatus.IN_CUSTOMER_BOX,
  OrderItemStatus.SHIPPING_REQUESTED,
  OrderItemStatus.PACKED,
];

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async customerBox(customerId: string) {
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
          status: { in: visibleCustomerItemStatuses },
        },
        include: { category: true, order: true },
        orderBy: { soldAt: 'desc' },
      }),
    ]);

    return {
      customer: {
        id: customer.id,
        displayName: customer.displayName,
        phone: customer.phone,
        verificationStatus: customer.verificationStatus,
      },
      box,
      items,
      summary: {
        totalAmount: box.totalAmount,
        totalItems: box.totalItems,
        pendingLabelCount: items.filter((item) => item.labelStatus === LabelStatus.PENDING).length,
        readyItemsCount: items.filter((item) => item.labelStatus === LabelStatus.ATTACHED).length,
      },
    };
  }

  async customerOrderItems(customerId: string, query: CustomerOrderItemsQueryDto) {
    const pagination = getPagination(query);
    const where: Prisma.OrderItemWhereInput = {
      customerId,
      status: query.status ?? { in: visibleCustomerItemStatuses },
      source: query.source,
      soldAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.orderItem.findMany({
        where,
        include: { category: true, order: true },
        orderBy: { soldAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.orderItem.count({ where }),
    ]);

    return toPaginatedResult(items, total, pagination.page, pagination.limit);
  }

  async customerOrders(customerId: string) {
    return this.prisma.order.findMany({
      where: {
        customerId,
        status: { not: OrderStatus.CANCELLED },
      },
      include: {
        items: {
          include: { category: true },
          orderBy: { soldAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

