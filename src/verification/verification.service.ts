import { HttpStatus, Injectable } from '@nestjs/common';
import { ActorType, Prisma, VerificationStatus } from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { AppException } from 'src/common/exceptions/app.exception';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { CreateVerificationRequestDto } from 'src/verification/dto/create-verification-request.dto';
import { VerificationQueryDto } from 'src/verification/dto/verification-query.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async requestVerification(customerId: string, dto: CreateVerificationRequestDto, request: Request) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    if (customer.verificationStatus === VerificationStatus.VERIFIED) {
      throw new AppException('Customer is already verified', 'CUSTOMER_ALREADY_VERIFIED', HttpStatus.CONFLICT);
    }

    const verificationRequest = await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: { verificationStatus: VerificationStatus.PENDING },
      });

      return tx.verificationRequest.create({
        data: {
          customerId,
          status: VerificationStatus.PENDING,
          note: dto.note,
        },
      });
    });

    await this.auditLogs.create({
      actorType: ActorType.CUSTOMER,
      actorId: customerId,
      action: 'customer.verification_requested',
      entityType: 'VerificationRequest',
      entityId: verificationRequest.id,
      metadata: dto as Prisma.InputJsonObject,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return verificationRequest;
  }

  async findAll(query: VerificationQueryDto) {
    const pagination = getPagination(query);
    const where: Prisma.VerificationRequestWhereInput = { status: query.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.verificationRequest.findMany({
        where,
        include: { customer: true, reviewedByAdmin: true },
        orderBy: { requestedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.verificationRequest.count({ where }),
    ]);
    return toPaginatedResult(items, total, pagination.page, pagination.limit);
  }

  findOne(id: string) {
    return this.prisma.verificationRequest.findUniqueOrThrow({
      where: { id },
      include: { customer: true, reviewedByAdmin: true },
    });
  }

  async review(
    id: string,
    status: VerificationStatus,
    note: string | undefined,
    adminId: string,
    request: Request,
  ) {
    const verificationRequest = await this.prisma.verificationRequest.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: verificationRequest.customerId },
        data: { verificationStatus: status },
      });

      return tx.verificationRequest.update({
        where: { id },
        data: {
          status,
          reviewedByAdminId: adminId,
          reviewedAt: new Date(),
          note,
        },
      });
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: status === VerificationStatus.VERIFIED ? 'customer.verified' : 'customer.rejected',
      entityType: 'VerificationRequest',
      entityId: id,
      metadata: { note, customerId: verificationRequest.customerId },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return updated;
  }
}
