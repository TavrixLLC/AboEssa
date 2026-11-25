import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActorType,
  CommissionStatus,
  CustomerStatus,
  LabelStatus,
  LiveSessionStatus,
  OrderItem,
  OrderItemStatus,
  OrderStatus,
  Prisma,
  ReferralStatus,
  SaleSource,
  VerificationStatus,
} from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { AppException } from 'src/common/exceptions/app.exception';
import { normalizePhone } from 'src/common/utils/phone.util';
import { toSafeCustomer } from 'src/common/utils/safe-user.util';
import { CreateVirtualCustomerDto } from 'src/customers/dto/create-virtual-customer.dto';
import { LabelPayload } from 'src/labels/label.types';
import { LabelsService } from 'src/labels/labels.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { QuickSaleDto } from 'src/sales/dto/quick-sale.dto';
import { SocketsService } from 'src/sockets/sockets.service';

export type SaleContext = {
  actorType: ActorType;
  actorId?: string;
  ip?: string;
  userAgent?: string | string[];
};

export type CreateSoldItemInput = {
  customerId: string;
  categoryId?: string;
  source: SaleSource;
  price: Prisma.Decimal | number | string;
  title?: string;
  description?: string;
  imageUrl?: string;
  snapshotUrl?: string;
  isBroken?: boolean;
  isGift?: boolean;
  isReplacement?: boolean;
  quantity?: number;
  createdByAdminId?: string;
  productListingId?: string;
  auctionId?: string;
  liveSessionId?: string;
  liveOfferId?: string;
  shouldCreatePrintJob?: boolean;
  initialLabelStatus?: LabelStatus;
  dedicatedOrder?: boolean;
  // Internal settlement of a bid placed before an account was blocked.
  fulfillExistingCommitment?: boolean;
};

export type SaleResult = {
  customer: ReturnType<typeof toSafeCustomer>;
  order: Awaited<ReturnType<PrismaService['order']['findUniqueOrThrow']>>;
  items: OrderItem[];
  labelPrintJobs: Awaited<ReturnType<PrismaService['labelPrintJob']['findMany']>>;
  labelPayloads: LabelPayload[];
  session?: { id: string; totalAmount: Prisma.Decimal; numberOfSales: number } | null;
};

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labelsService: LabelsService,
    private readonly auditLogs: AuditLogsService,
    private readonly sockets: SocketsService,
  ) {}

  async quickSale(dto: QuickSaleDto, adminId: string, request: Request) {
    if (!dto.customerId && !dto.createVirtualCustomer) {
      throw new AppException(
        'customerId or createVirtualCustomer is required',
        'CUSTOMER_NOT_FOUND',
        HttpStatus.BAD_REQUEST,
      );
    }

    const allowedQuickSaleSources: SaleSource[] = [
      SaleSource.TIKTOK_LIVE_MANUAL,
      SaleSource.ADMIN_MANUAL,
    ];
    if (!allowedQuickSaleSources.includes(dto.source)) {
      throw new AppException(
        'Sale source is not allowed for quick sale',
        'INVALID_SALE_SOURCE',
        HttpStatus.BAD_REQUEST,
      );
    }

    const customerId =
      dto.customerId ??
      (await this.findOrCreateVirtualCustomer(dto.createVirtualCustomer!, adminId, request));
    return this.createSoldItem(
      {
        customerId,
        categoryId: dto.categoryId,
        source: dto.source,
        price: dto.price,
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        snapshotUrl: dto.snapshotUrl,
        isBroken: dto.isBroken,
        isGift: dto.isGift,
        isReplacement: dto.isReplacement,
        quantity: dto.quantity ?? 1,
        createdByAdminId: adminId,
        liveSessionId: dto.salesSessionId,
        shouldCreatePrintJob: dto.printNow ?? false,
        initialLabelStatus: LabelStatus.PENDING,
      },
      {
        actorType: ActorType.ADMIN,
        actorId: adminId,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
      'QUICK_SALE_CREATED',
    );
  }

  async createSoldItem(
    input: CreateSoldItemInput,
    context: SaleContext,
    primaryAuditAction = 'ORDER_ITEM_SOLD',
  ) {
    const result = await this.prisma.$transaction((tx) =>
      this.createSoldItemInTransaction(tx, input),
    );
    await this.recordSoldItemSideEffects(input, result, context, primaryAuditAction);
    return this.toPublicSaleResult(result);
  }

  async createSoldItemInTransaction(
    tx: Prisma.TransactionClient,
    input: CreateSoldItemInput,
  ): Promise<SaleResult> {
    const quantity = input.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new AppException(
        'Quantity must be between 1 and 100',
        'INVALID_QUANTITY',
        HttpStatus.BAD_REQUEST,
      );
    }

    const price = new Prisma.Decimal(input.price);
    if (!input.isGift && price.lessThanOrEqualTo(0)) {
      throw new AppException(
        'Price must be greater than 0',
        'INVALID_PRICE',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (input.isGift && price.lessThan(0)) {
      throw new AppException(
        'Gift price cannot be negative',
        'INVALID_PRICE',
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId },
      include: { referralAttribution: { include: { referralCode: true } } },
    });

    if (!customer) {
      throw new AppException('Customer was not found', 'CUSTOMER_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (customer.status === CustomerStatus.BLOCKED && !input.fulfillExistingCommitment) {
      throw new AppException(
        'Customer account is blocked',
        'CUSTOMER_BLOCKED',
        HttpStatus.FORBIDDEN,
      );
    }

    if (input.categoryId) {
      const category = await tx.category.findUnique({ where: { id: input.categoryId } });
      if (!category) {
        throw new AppException(
          'Category was not found',
          'CATEGORY_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    if (input.liveSessionId) {
      const session = await tx.liveSession.findUnique({ where: { id: input.liveSessionId } });
      if (!session || session.status !== LiveSessionStatus.ACTIVE) {
        throw new AppException(
          'Sales session was not found',
          'SESSION_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    const totalAmount = price.mul(quantity);
    const order = input.dedicatedOrder
      ? await tx.order.create({ data: { customerId: customer.id } })
      : await this.getOrCreateOpenOrder(tx, customer.id);
    await tx.customerBox.upsert({
      where: { customerId: customer.id },
      create: {
        customerId: customer.id,
        totalItems: quantity,
        totalAmount,
        lastItemAt: now,
      },
      update: {
        totalItems: { increment: quantity },
        totalAmount: { increment: totalAmount },
        lastItemAt: now,
      },
    });

    const items: OrderItem[] = [];
    for (let index = 0; index < quantity; index += 1) {
      const barcode = await this.labelsService.generateBarcode(tx);
      items.push(
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            customerId: customer.id,
            categoryId: input.categoryId,
            productListingId: input.productListingId,
            auctionId: input.auctionId,
            liveSessionId: input.liveSessionId,
            liveOfferId: input.liveOfferId,
            source: input.source,
            title: input.title,
            description: input.description,
            imageUrl: input.imageUrl,
            snapshotUrl: input.snapshotUrl,
            price,
            quantity: 1,
            barcode,
            status: OrderItemStatus.IN_CUSTOMER_BOX,
            labelStatus: input.initialLabelStatus ?? LabelStatus.PENDING,
            isBroken: input.isBroken ?? false,
            isGift: input.isGift ?? false,
            isReplacement: input.isReplacement ?? false,
            soldAt: now,
            createdByAdminId: input.createdByAdminId,
          },
        }),
      );
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        totalAmount: { increment: totalAmount },
        itemsCount: { increment: quantity },
      },
    });
    await tx.customer.update({
      where: { id: customer.id },
      data: { totalPurchasedAmount: { increment: totalAmount } },
    });

    if (input.liveSessionId) {
      await tx.liveSession.update({
        where: { id: input.liveSessionId },
        data: {
          totalAmount: { increment: totalAmount },
          numberOfSales: { increment: quantity },
        },
      });
    }

    await this.createReferralCommissions(tx, customer, items, now);

    const labelPrintJobs = [];
    if (input.shouldCreatePrintJob) {
      for (const item of items) {
        labelPrintJobs.push(
          await this.labelsService.createPrintJob(item.id, input.createdByAdminId, tx),
        );
      }
    }

    const labelPayloads = [];
    for (const item of items) {
      labelPayloads.push(await this.labelsService.createLabelPayload(item.id, tx));
    }

    const updatedOrder = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    const updatedCustomer = await tx.customer.findUniqueOrThrow({ where: { id: customer.id } });
    const session = input.liveSessionId
      ? await tx.liveSession.findUnique({ where: { id: input.liveSessionId } })
      : null;

    return {
      customer: toSafeCustomer(updatedCustomer),
      order: updatedOrder,
      items,
      labelPrintJobs,
      labelPayloads,
      session,
    };
  }

  async recordSoldItemSideEffects(
    input: CreateSoldItemInput,
    result: SaleResult,
    context: SaleContext,
    primaryAuditAction = 'ORDER_ITEM_SOLD',
  ) {
    await this.writeSaleAudit(primaryAuditAction, input, result.items, context);
    await this.writePrintJobAudit(result.labelPrintJobs, context);
    this.emitSaleEvents(result, input);
  }

  toPublicSaleResult(result: SaleResult) {
    return {
      customer: result.customer,
      order: result.order,
      items: result.items,
      labelPrintJobs: result.labelPrintJobs,
      labelPayloads: result.labelPayloads,
    };
  }

  private async findOrCreateVirtualCustomer(
    dto: CreateVirtualCustomerDto,
    adminId: string,
    request: Request,
  ) {
    const phone = dto.phone ? normalizePhone(dto.phone) : undefined;
    if (phone) {
      const existing = await this.prisma.customer.findUnique({ where: { phone } });
      if (existing) {
        return existing.id;
      }
    }

    const customer = await this.prisma.customer.create({
      data: {
        displayName: dto.displayName,
        phone,
        whatsappPhone: dto.whatsappPhone ? normalizePhone(dto.whatsappPhone) : phone,
        tiktokUsername: dto.tiktokUsername,
        notes: dto.notes,
        status: CustomerStatus.VIRTUAL,
        verificationStatus: VerificationStatus.UNVERIFIED,
        isVirtual: true,
        box: { create: {} },
        notificationSettings: { create: {} },
      },
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'customer.virtual_created',
      entityType: 'Customer',
      entityId: customer.id,
      metadata: { displayName: customer.displayName, phone: customer.phone },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return customer.id;
  }

  private async getOrCreateOpenOrder(tx: Prisma.TransactionClient, customerId: string) {
    const existing = await tx.order.findFirst({
      where: { customerId, status: OrderStatus.OPEN },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      return existing;
    }

    return tx.order.create({
      data: {
        customerId,
        status: OrderStatus.OPEN,
        totalAmount: 0,
        itemsCount: 0,
      },
    });
  }

  private async createReferralCommissions(
    tx: Prisma.TransactionClient,
    customer: {
      id: string;
      referralAttribution: Prisma.ReferralAttributionGetPayload<{
        include: { referralCode: true };
      }> | null;
    },
    items: OrderItem[],
    now: Date,
  ) {
    const attribution = customer.referralAttribution;
    if (
      !attribution ||
      attribution.status !== ReferralStatus.ACTIVE ||
      attribution.expiresAt < now
    ) {
      return;
    }

    for (const item of items) {
      const amountBase = new Prisma.Decimal(item.price);
      const commissionRate = new Prisma.Decimal(attribution.referralCode.commissionRate);
      await tx.commissionLedger.create({
        data: {
          influencerId: attribution.influencerId,
          customerId: customer.id,
          orderItemId: item.id,
          amountBase,
          commissionRate,
          commissionAmount: amountBase.mul(commissionRate).div(100),
          status: CommissionStatus.PENDING,
          reason: `Referral commission for ${item.source}`,
        },
      });
    }
  }

  private async writeSaleAudit(
    action: string,
    input: CreateSoldItemInput,
    items: OrderItem[],
    context: SaleContext,
  ) {
    await this.auditLogs.create({
      actorType: context.actorType,
      actorId: context.actorId,
      action,
      entityType: 'OrderItem',
      entityId: items[0]?.id,
      metadata: {
        source: input.source,
        price: String(input.price),
        categoryId: input.categoryId,
        quantity: items.length,
        itemIds: items.map((item) => item.id),
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    await Promise.all(
      items.map((item) =>
        this.auditLogs.create({
          actorType: context.actorType,
          actorId: context.actorId,
          action: 'ORDER_ITEM_SOLD',
          entityType: 'OrderItem',
          entityId: item.id,
          metadata: { source: item.source, barcode: item.barcode, price: String(item.price) },
          ip: context.ip,
          userAgent: context.userAgent,
        }),
      ),
    );
  }

  private async writePrintJobAudit(
    labelPrintJobs: { id: string; orderItemId: string; barcode: string }[],
    context: SaleContext,
  ) {
    await Promise.all(
      labelPrintJobs.map((job) =>
        this.auditLogs.create({
          actorType: context.actorType,
          actorId: context.actorId,
          action: 'LABEL_PRINT_JOB_CREATED',
          entityType: 'LabelPrintJob',
          entityId: job.id,
          metadata: { orderItemId: job.orderItemId, barcode: job.barcode },
          ip: context.ip,
          userAgent: context.userAgent,
        }),
      ),
    );
  }

  private emitSaleEvents(result: SaleResult, input: CreateSoldItemInput) {
    for (const item of result.items) {
      const payload = {
        itemId: item.id,
        barcode: item.barcode,
        customerName: result.customer.displayName,
        price: Number(item.price),
        currency: result.labelPayloads[0]?.currency ?? 'IQD',
        categoryName: result.labelPayloads.find((payload) => payload.itemBarcode === item.barcode)
          ?.categoryName,
        source: item.source,
        imageUrl: item.imageUrl,
        snapshotUrl: item.snapshotUrl,
        soldAt: item.soldAt.toISOString(),
        sessionId: input.liveSessionId,
        sessionTotalAmount: result.session ? Number(result.session.totalAmount) : undefined,
        sessionSalesCount: result.session?.numberOfSales,
      };
      this.sockets.emitSale(payload, item.customerId);
    }
  }
}
