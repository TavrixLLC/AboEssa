import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActorType,
  LabelPrintJob,
  LabelStatus,
  OrderItemStatus,
  Prisma,
  PrintJobStatus,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { APP_SETTINGS_ID } from 'src/common/constants/app.constants';
import { AppException } from 'src/common/exceptions/app.exception';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { LabelJobQueryDto } from 'src/labels/dto/label-job-query.dto';
import { LabelPayload } from 'src/labels/label.types';
import { PrismaService } from 'src/prisma/prisma.service';
import { SocketsService } from 'src/sockets/sockets.service';

type TransactionClient = Prisma.TransactionClient;

const defaultLabelTemplate = {
  version: 1,
  size: '70x40mm',
  fields: ['storeName', 'customerName', 'price', 'categoryName', 'barcode', 'soldAt'],
};

@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly sockets: SocketsService,
  ) {}

  async generateBarcode(tx: TransactionClient = this.prisma) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const suffix = randomBytes(5)
        .toString('base64url')
        .replace(/[-_]/g, '')
        .slice(0, 6)
        .toUpperCase();
      const barcode = `ITEM-${date}-${suffix}`;
      const existing = await tx.orderItem.findUnique({ where: { barcode } });
      if (!existing) {
        return barcode;
      }
    }

    throw new AppException(
      'Could not generate a unique barcode',
      'BARCODE_GENERATION_FAILED',
      HttpStatus.CONFLICT,
    );
  }

  async createLabelPayload(
    orderItemId: string,
    tx: TransactionClient = this.prisma,
  ): Promise<LabelPayload> {
    const [settings, item] = await Promise.all([
      this.getSettings(tx),
      tx.orderItem.findUnique({
        where: { id: orderItemId },
        include: {
          customer: true,
          category: true,
        },
      }),
    ]);

    if (!item) {
      throw new AppException(
        'Order item was not found',
        'ORDER_ITEM_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      storeName: settings.storeName,
      customerName: item.customer.displayName,
      customerPhone: item.customer.phone ?? item.customer.whatsappPhone ?? undefined,
      customerCode: `CUST-${item.customer.id.slice(-6).toUpperCase()}`,
      itemBarcode: item.barcode,
      price: Number(item.price),
      currency: settings.currency,
      categoryName: item.category?.name,
      source: item.source,
      soldAt: item.soldAt.toISOString(),
      flags: {
        isBroken: item.isBroken,
        isGift: item.isGift,
        isReplacement: item.isReplacement,
      },
      labelStatus: item.labelStatus,
      qrValue: item.barcode,
      barcodeValue: item.barcode,
    };
  }

  async createPrintJob(
    orderItemId: string,
    _adminId?: string,
    tx: TransactionClient = this.prisma,
  ) {
    const item = await tx.orderItem.findUnique({
      where: { id: orderItemId },
      include: { printJobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!item) {
      throw new AppException(
        'Order item was not found',
        'ORDER_ITEM_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    if (item.status === OrderItemStatus.CANCELLED) {
      throw new AppException(
        'Cancelled item cannot be printed',
        'ORDER_ITEM_CANCELLED',
        HttpStatus.CONFLICT,
      );
    }
    if (item.labelStatus === LabelStatus.ATTACHED) {
      throw new AppException(
        'Label is already attached',
        'LABEL_ALREADY_ATTACHED',
        HttpStatus.CONFLICT,
      );
    }

    const existing = item.printJobs.find((job) => job.status !== PrintJobStatus.FAILED);
    if (existing) {
      return existing;
    }

    const settings = await this.getSettings(tx);
    const job = await tx.labelPrintJob.create({
      data: {
        orderItemId: item.id,
        customerId: item.customerId,
        barcode: item.barcode,
        template: settings.labelTemplate ?? defaultLabelTemplate,
        status: PrintJobStatus.PENDING,
      },
    });

    return job;
  }

  async findAll(query: LabelJobQueryDto) {
    const pagination = getPagination(query);
    const where: Prisma.LabelPrintJobWhereInput = {
      status: query.status,
      customerId: query.customerId,
      barcode: query.barcode ? { contains: query.barcode, mode: 'insensitive' } : undefined,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.labelPrintJob.findMany({
        where,
        include: { orderItem: { include: { customer: true, category: true } }, customer: true },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.labelPrintJob.count({ where }),
    ]);

    return toPaginatedResult(items, total, pagination.page, pagination.limit);
  }

  findOne(id: string) {
    return this.prisma.labelPrintJob.findUniqueOrThrow({
      where: { id },
      include: { orderItem: { include: { customer: true, category: true } }, customer: true },
    });
  }

  async markPrinted(jobId: string, adminId: string) {
    const job = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.labelPrintJob.findUnique({ where: { id: jobId } });
      if (!existing) {
        throw new AppException(
          'Print job was not found',
          'PRINT_JOB_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }

      const now = new Date();
      const updated = await tx.labelPrintJob.update({
        where: { id: jobId },
        data: {
          status: PrintJobStatus.PRINTED,
          printedAt: now,
          printedByAdminId: adminId,
          error: null,
        },
      });
      await tx.orderItem.update({
        where: { id: existing.orderItemId },
        data: {
          labelStatus: LabelStatus.PRINTED,
          labelPrintedAt: now,
        },
      });
      return updated;
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'LABEL_MARKED_PRINTED',
      entityType: 'LabelPrintJob',
      entityId: job.id,
      metadata: { orderItemId: job.orderItemId, barcode: job.barcode },
    });
    this.sockets.emitLabelJobUpdated(job);
    return job;
  }

  async markFailed(jobId: string, adminId: string, error: string) {
    const job = await this.prisma.labelPrintJob.update({
      where: { id: jobId },
      data: {
        status: PrintJobStatus.FAILED,
        error,
      },
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'LABEL_PRINT_FAILED',
      entityType: 'LabelPrintJob',
      entityId: job.id,
      metadata: { orderItemId: job.orderItemId, barcode: job.barcode, error },
    });
    this.sockets.emitLabelJobUpdated(job);
    return job;
  }

  async confirmAttached(jobId: string, adminId: string) {
    const job = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.labelPrintJob.findUnique({ where: { id: jobId } });
      if (!existing) {
        throw new AppException(
          'Print job was not found',
          'PRINT_JOB_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }
      return this.confirmAttachedForExistingJob(tx, existing, adminId);
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'LABEL_ATTACHED_CONFIRMED',
      entityType: 'LabelPrintJob',
      entityId: job.id,
      metadata: { orderItemId: job.orderItemId, barcode: job.barcode },
    });
    this.sockets.emitLabelJobUpdated(job);
    return job;
  }

  async confirmAttachedByItem(orderItemId: string, adminId: string) {
    const job = await this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findUnique({
        where: { id: orderItemId },
        include: { printJobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      if (!item) {
        throw new AppException(
          'Order item was not found',
          'ORDER_ITEM_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }
      if (item.status === OrderItemStatus.CANCELLED) {
        throw new AppException(
          'Cancelled item cannot be confirmed',
          'ORDER_ITEM_CANCELLED',
          HttpStatus.CONFLICT,
        );
      }

      const latestJob = item.printJobs[0] ?? (await this.createPrintJob(orderItemId, adminId, tx));
      return this.confirmAttachedForExistingJob(tx, latestJob, adminId);
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'LABEL_ATTACHED_CONFIRMED',
      entityType: 'OrderItem',
      entityId: orderItemId,
      metadata: { printJobId: job.id, barcode: job.barcode },
    });
    this.sockets.emitLabelJobUpdated(job);
    return job;
  }

  private async confirmAttachedForExistingJob(
    tx: TransactionClient,
    job: LabelPrintJob,
    adminId: string,
  ) {
    const now = new Date();
    const updated = await tx.labelPrintJob.update({
      where: { id: job.id },
      data: {
        status: PrintJobStatus.CONFIRMED_ATTACHED,
        confirmedAt: now,
        confirmedByAdminId: adminId,
        printedAt: job.printedAt ?? now,
        printedByAdminId: job.printedByAdminId ?? adminId,
        error: null,
      },
    });
    await tx.orderItem.update({
      where: { id: job.orderItemId },
      data: {
        labelStatus: LabelStatus.ATTACHED,
        labelPrintedAt: job.printedAt ?? now,
        labelAttachedAt: now,
      },
    });
    return updated;
  }

  private async getSettings(tx: TransactionClient = this.prisma) {
    return tx.appSettings.upsert({
      where: { id: APP_SETTINGS_ID },
      create: {
        id: APP_SETTINGS_ID,
        storeName: 'شناشيل',
        currency: 'IQD',
        labelTemplate: defaultLabelTemplate,
      },
      update: {},
    });
  }
}
