import { HttpStatus, Injectable } from '@nestjs/common';
import { ActorType, CustomerStatus, Prisma, VerificationStatus } from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { AppException } from 'src/common/exceptions/app.exception';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { normalizePhone } from 'src/common/utils/phone.util';
import { toSafeCustomer } from 'src/common/utils/safe-user.util';
import { CreateVirtualCustomerDto } from 'src/customers/dto/create-virtual-customer.dto';
import { CustomerQueryDto } from 'src/customers/dto/customer-query.dto';
import { ReviewCustomerDto } from 'src/customers/dto/review-customer.dto';
import { UpdateCustomerDto } from 'src/customers/dto/update-customer.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async createVirtual(dto: CreateVirtualCustomerDto, adminId: string, request: Request) {
    const phone = dto.phone ? normalizePhone(dto.phone) : undefined;
    if (phone) {
      const existing = await this.prisma.customer.findUnique({ where: { phone } });
      if (existing) {
        throw new AppException('A customer with this phone already exists', 'CUSTOMER_PHONE_EXISTS', HttpStatus.CONFLICT);
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

    return toSafeCustomer(customer);
  }

  async findAll(query: CustomerQueryDto) {
    const pagination = getPagination(query);
    const where: Prisma.CustomerWhereInput = {
      status: query.status,
      verificationStatus: query.verificationStatus,
      isVirtual: query.isVirtual,
      OR: query.q
        ? [
            { displayName: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q } },
            { whatsappPhone: { contains: query.q } },
            { tiktokUsername: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return toPaginatedResult(
      items.map((customer) => toSafeCustomer(customer)),
      total,
      pagination.page,
      pagination.limit,
    );
  }

  async findOne(id: string) {
    return toSafeCustomer(await this.prisma.customer.findUniqueOrThrow({ where: { id } }));
  }

  async update(id: string, dto: UpdateCustomerDto, adminId: string, request: Request) {
    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        displayName: dto.displayName,
        phone: dto.phone ? normalizePhone(dto.phone) : undefined,
        whatsappPhone: dto.whatsappPhone ? normalizePhone(dto.whatsappPhone) : undefined,
        tiktokUsername: dto.tiktokUsername,
        purchaseLimitOverride: dto.purchaseLimitOverride,
        trustLevel: dto.trustLevel,
        notes: dto.notes,
      },
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'customer.updated',
      entityType: 'Customer',
      entityId: id,
      metadata: dto as Prisma.InputJsonObject,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return toSafeCustomer(customer);
  }

  async verify(id: string, dto: ReviewCustomerDto, adminId: string, request: Request) {
    const customer = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id },
        data: { verificationStatus: VerificationStatus.VERIFIED },
      });
      await tx.verificationRequest.create({
        data: {
          customerId: id,
          status: VerificationStatus.VERIFIED,
          reviewedByAdminId: adminId,
          reviewedAt: new Date(),
          note: dto.note,
        },
      });
      return updated;
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'customer.verified',
      entityType: 'Customer',
      entityId: id,
      metadata: dto as Prisma.InputJsonObject,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return toSafeCustomer(customer);
  }

  async reject(id: string, dto: ReviewCustomerDto, adminId: string, request: Request) {
    const customer = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id },
        data: { verificationStatus: VerificationStatus.REJECTED },
      });
      await tx.verificationRequest.create({
        data: {
          customerId: id,
          status: VerificationStatus.REJECTED,
          reviewedByAdminId: adminId,
          reviewedAt: new Date(),
          note: dto.note,
        },
      });
      return updated;
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'customer.rejected',
      entityType: 'Customer',
      entityId: id,
      metadata: dto as Prisma.InputJsonObject,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return toSafeCustomer(customer);
  }

  async block(id: string, adminId: string, request: Request) {
    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        status: CustomerStatus.BLOCKED,
        refreshTokenHash: null,
      },
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'customer.blocked',
      entityType: 'Customer',
      entityId: id,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return toSafeCustomer(customer);
  }

  async unblock(id: string, adminId: string, request: Request) {
    const existing = await this.prisma.customer.findUniqueOrThrow({ where: { id } });
    if (existing.deletedAt) {
      throw new AppException(
        'A deleted customer account cannot be restored',
        'CUSTOMER_ACCOUNT_DELETED',
        HttpStatus.CONFLICT,
      );
    }
    const customer = await this.prisma.customer.update({
      where: { id },
      data: { status: existing.isVirtual ? CustomerStatus.VIRTUAL : CustomerStatus.ACTIVE },
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'customer.unblocked',
      entityType: 'Customer',
      entityId: id,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return toSafeCustomer(customer);
  }
}

