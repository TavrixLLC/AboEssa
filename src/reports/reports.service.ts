import { Injectable } from '@nestjs/common';
import {
  AuctionStatus,
  CommissionStatus,
  CustomerStatus,
  LabelStatus,
  OrderItemStatus,
  Prisma,
  ShippingRequestStatus,
  VerificationStatus,
} from '@prisma/client';
import { DateRangeQueryDto } from 'src/reports/dto/date-range-query.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboardStats() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 6);
    last7Days.setHours(0, 0, 0, 0);

    const [
      totalCustomers,
      virtualCustomers,
      verifiedCustomers,
      blockedCustomers,
      todayItems,
      activeSalesSession,
      pendingLabelsCount,
      shippingRequestsCount,
      activeAuctionsCount,
      soldItemsBySource,
      topCategories,
      topCustomers,
      pendingCommissions,
      last7DaysItems,
      recentPurchases,
    ] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { isVirtual: true } }),
      this.prisma.customer.count({ where: { verificationStatus: VerificationStatus.VERIFIED } }),
      this.prisma.customer.count({ where: { status: CustomerStatus.BLOCKED } }),
      this.prisma.orderItem.findMany({
        where: { soldAt: { gte: startOfToday }, status: { not: OrderItemStatus.CANCELLED } },
      }),
      this.prisma.liveSession.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { startedAt: 'desc' },
        select: { id: true, title: true, status: true, startedAt: true },
      }),
      this.prisma.orderItem.count({
        where: { labelStatus: LabelStatus.PENDING, status: { not: OrderItemStatus.CANCELLED } },
      }),
      this.prisma.shipmentRequest.count({ where: { status: ShippingRequestStatus.REQUESTED } }),
      this.prisma.auction.count({ where: { status: AuctionStatus.ACTIVE } }),
      this.prisma.orderItem.groupBy({ by: ['source'], _count: true, _sum: { price: true } }),
      this.prisma.orderItem.groupBy({
        by: ['categoryId'],
        _count: true,
        _sum: { price: true },
        take: 10,
        orderBy: { _count: { categoryId: 'desc' } },
      }),
      this.prisma.orderItem.groupBy({
        by: ['customerId'],
        _count: true,
        _sum: { price: true },
        take: 10,
        orderBy: { _sum: { price: 'desc' } },
      }),
      this.prisma.commissionLedger.aggregate({
        where: { status: CommissionStatus.PENDING },
        _sum: { commissionAmount: true },
      }),
      this.prisma.orderItem.findMany({
        where: { soldAt: { gte: last7Days }, status: { not: OrderItemStatus.CANCELLED } },
      }),
      this.prisma.orderItem.findMany({
        where: {
          checkoutConfirmedAt: { not: null },
          status: { not: OrderItemStatus.CANCELLED },
        },
        orderBy: [{ checkoutConfirmedAt: 'desc' }, { createdAt: 'desc' }],
        take: 12,
        select: {
          id: true,
          title: true,
          source: true,
          price: true,
          quantity: true,
          status: true,
          paymentMethod: true,
          walletPaidAmount: true,
          cashDueAmount: true,
          checkoutConfirmedAt: true,
          customer: {
            select: {
              id: true,
              displayName: true,
              phone: true,
            },
          },
        },
      }),
    ]);

    return this.serialize({
      generatedAt: new Date(),
      totalCustomers,
      virtualCustomers,
      verifiedCustomers,
      blockedCustomers,
      todaySalesCount: todayItems.length,
      todaySalesAmount: todayItems.reduce(
        (sum, item) => sum.plus(item.price),
        new Prisma.Decimal(0),
      ),
      activeSalesSession,
      pendingLabelsCount,
      shippingRequestsCount,
      activeAuctionsCount,
      soldItemsBySource,
      topCategories,
      topCustomers,
      pendingCommissions: pendingCommissions._sum.commissionAmount ?? 0,
      last7DaysSales: this.bucketSalesByDay(last7DaysItems),
      recentPurchases,
      quickCards: {
        pendingLabelsCount,
        shippingRequestsCount,
        activeAuctionsCount,
      },
    });
  }

  sales(query: DateRangeQueryDto) {
    return this.prisma.orderItem
      .findMany({
        where: this.saleWhere(query),
        include: { customer: true, category: true },
        orderBy: { soldAt: 'desc' },
      })
      .then((items) => this.serialize(items));
  }

  categories(query: DateRangeQueryDto) {
    return this.prisma.orderItem
      .groupBy({
        by: ['categoryId'],
        where: this.saleWhere(query),
        _count: true,
        _sum: { price: true },
      })
      .then((items) => this.serialize(items));
  }

  customers(query: DateRangeQueryDto) {
    return this.prisma.orderItem
      .groupBy({
        by: ['customerId'],
        where: this.saleWhere(query),
        _count: true,
        _sum: { price: true },
      })
      .then((items) => this.serialize(items));
  }

  warehouse() {
    return this.prisma.orderItem
      .groupBy({ by: ['labelStatus', 'status'], _count: true, _sum: { price: true } })
      .then((items) => this.serialize(items));
  }

  influencers(query: DateRangeQueryDto) {
    return this.prisma.commissionLedger
      .findMany({
        where: { createdAt: this.dateRange(query) },
        include: { influencer: true, customer: true, orderItem: true },
        orderBy: { createdAt: 'desc' },
      })
      .then((items) => this.serialize(items));
  }

  auctions(query: DateRangeQueryDto) {
    return this.prisma.auction
      .findMany({
        where: { createdAt: this.dateRange(query) },
        include: { winningBid: true, winnerCustomer: true },
      })
      .then((items) => this.serialize(items));
  }

  private saleWhere(query: DateRangeQueryDto): Prisma.OrderItemWhereInput {
    return {
      source: query.source,
      soldAt: this.dateRange(query),
      status: { not: OrderItemStatus.CANCELLED },
    };
  }

  private dateRange(query: DateRangeQueryDto) {
    return query.from || query.to
      ? {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        }
      : undefined;
  }

  private bucketSalesByDay(items: { soldAt: Date; price: Prisma.Decimal }[]) {
    const buckets = new Map<string, { date: string; count: number; amount: Prisma.Decimal }>();
    for (const item of items) {
      const date = item.soldAt.toISOString().slice(0, 10);
      const bucket = buckets.get(date) ?? { date, count: 0, amount: new Prisma.Decimal(0) };
      bucket.count += 1;
      bucket.amount = bucket.amount.plus(item.price);
      buckets.set(date, bucket);
    }
    return [...buckets.values()].map((bucket) => ({ ...bucket, amount: bucket.amount.toFixed(2) }));
  }

  private serialize(value: any): any {
    if (value instanceof Prisma.Decimal) return value.toFixed(2);
    if (value instanceof Date) return value;
    if (Array.isArray(value)) return value.map((item) => this.serialize(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.serialize(item)]),
      );
    }
    return value;
  }
}
