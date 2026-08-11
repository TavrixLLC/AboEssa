import { HttpStatus, Injectable } from '@nestjs/common';
import { ActorType, CommissionStatus, Prisma } from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { CommissionQueryDto } from 'src/commissions/dto/commission-query.dto';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { AppException } from 'src/common/exceptions/app.exception';
import { CreateInfluencerDto } from 'src/influencers/dto/create-influencer.dto';
import { UpdateInfluencerDto } from 'src/influencers/dto/update-influencer.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReferralCodeDto } from 'src/referral-codes/dto/create-referral-code.dto';
import { UpdateReferralCodeDto } from 'src/referral-codes/dto/update-referral-code.dto';

@Injectable()
export class InfluencersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async createInfluencer(dto: CreateInfluencerDto, adminId: string, request: Request) {
    const influencer = await this.prisma.influencer.create({ data: dto });
    await this.audit(adminId, 'influencer.created', 'Influencer', influencer.id, dto, request);
    return influencer;
  }

  listInfluencers() {
    return this.prisma.influencer.findMany({ orderBy: { createdAt: 'desc' } });
  }

  getInfluencer(id: string) {
    return this.prisma.influencer.findUniqueOrThrow({
      where: { id },
      include: { referralCodes: true, referralAttributions: true },
    });
  }

  async updateInfluencer(id: string, dto: UpdateInfluencerDto, adminId: string, request: Request) {
    const influencer = await this.prisma.influencer.update({ where: { id }, data: dto });
    await this.audit(adminId, 'influencer.updated', 'Influencer', id, dto, request);
    return influencer;
  }

  async deactivateInfluencer(id: string, adminId: string, request: Request) {
    const influencer = await this.prisma.influencer.update({ where: { id }, data: { isActive: false } });
    await this.audit(adminId, 'influencer.deactivated', 'Influencer', id, {}, request);
    return influencer;
  }

  async createReferralCode(dto: CreateReferralCodeDto, adminId: string, request: Request) {
    const influencer = await this.prisma.influencer.findUnique({ where: { id: dto.influencerId } });
    if (!influencer) throw new AppException('Influencer was not found', 'INFLUENCER_NOT_FOUND', HttpStatus.NOT_FOUND);
    if (!influencer.isActive) throw new AppException('Influencer is inactive', 'INFLUENCER_INACTIVE', HttpStatus.CONFLICT);
    this.validateCodeDates(dto.startsAt, dto.endsAt);
    const code = await this.prisma.referralCode.create({
      data: {
        influencerId: dto.influencerId,
        code: dto.code.trim().toUpperCase(),
        commissionRate: dto.commissionRate,
        durationDays: dto.durationDays,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
    await this.audit(adminId, 'referral_code.created', 'ReferralCode', code.id, dto, request);
    return code;
  }

  listReferralCodes() {
    return this.prisma.referralCode.findMany({ include: { influencer: true }, orderBy: { createdAt: 'desc' } });
  }

  getReferralCode(id: string) {
    return this.prisma.referralCode.findUniqueOrThrow({ where: { id }, include: { influencer: true } });
  }

  async updateReferralCode(id: string, dto: UpdateReferralCodeDto, adminId: string, request: Request) {
    if (dto.influencerId) {
      const influencer = await this.prisma.influencer.findUnique({ where: { id: dto.influencerId } });
      if (!influencer) throw new AppException('Influencer was not found', 'INFLUENCER_NOT_FOUND', HttpStatus.NOT_FOUND);
      if (!influencer.isActive) throw new AppException('Influencer is inactive', 'INFLUENCER_INACTIVE', HttpStatus.CONFLICT);
    }
    this.validateCodeDates(dto.startsAt, dto.endsAt);
    const code = await this.prisma.referralCode.update({
      where: { id },
      data: {
        influencerId: dto.influencerId,
        code: dto.code?.trim().toUpperCase(),
        commissionRate: dto.commissionRate,
        durationDays: dto.durationDays,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
    await this.audit(adminId, 'referral_code.updated', 'ReferralCode', id, dto, request);
    return code;
  }

  async deactivateReferralCode(id: string, adminId: string, request: Request) {
    const code = await this.prisma.referralCode.update({ where: { id }, data: { isActive: false } });
    await this.audit(adminId, 'referral_code.deactivated', 'ReferralCode', id, {}, request);
    return code;
  }

  async commissions(query: CommissionQueryDto) {
    const pagination = getPagination(query);
    const where: Prisma.CommissionLedgerWhereInput = {
      status: query.status,
      influencerId: query.influencerId,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.commissionLedger.findMany({
        where,
        include: { influencer: true, customer: true, orderItem: { include: { order: true } } },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.commissionLedger.count({ where }),
    ]);
    return toPaginatedResult(items.map((item) => this.toCommissionResponse(item)), total, pagination.page, pagination.limit);
  }

  influencerCommissions(id: string, query: CommissionQueryDto) {
    return this.commissions({ ...query, influencerId: id });
  }

  async setCommissionStatus(id: string, status: CommissionStatus, adminId: string, request: Request) {
    const current = await this.prisma.commissionLedger.findUnique({ where: { id } });
    if (!current) throw new AppException('Commission was not found', 'COMMISSION_NOT_FOUND', HttpStatus.NOT_FOUND);
    if (current.status === status) return this.toCommissionResponse(current);
    if (current.status === CommissionStatus.PAID && status === CommissionStatus.CANCELLED) {
      throw new AppException('Paid commissions cannot be cancelled', 'COMMISSION_ALREADY_PAID', HttpStatus.CONFLICT);
    }
    if (current.status === CommissionStatus.CANCELLED) {
      throw new AppException('Commission is cancelled', 'COMMISSION_CANCELLED', HttpStatus.CONFLICT);
    }
    if (status === CommissionStatus.PAID && current.status !== CommissionStatus.APPROVED) {
      throw new AppException('Commission must be approved before payment', 'INVALID_COMMISSION_STATUS_TRANSITION', HttpStatus.CONFLICT);
    }
    const data: Prisma.CommissionLedgerUpdateInput = { status };
    if (status === CommissionStatus.APPROVED) data.approvedAt = new Date();
    if (status === CommissionStatus.PAID) data.paidAt = new Date();
    if (status === CommissionStatus.CANCELLED || status === CommissionStatus.REVERSED) {
      data.reversedAt = new Date();
      data.cancelledAt = new Date();
    }
    const commission = await this.prisma.$transaction((tx) => tx.commissionLedger.update({ where: { id }, data }));
    await this.audit(adminId, `commission.${status.toLowerCase()}`, 'CommissionLedger', id, { status }, request);
    return this.toCommissionResponse(commission);
  }

  async influencerReport(id: string) {
    const [customersCount, expiredAttributionCount, totals] = await Promise.all([
      this.prisma.referralAttribution.count({ where: { influencerId: id } }),
      this.prisma.referralAttribution.count({ where: { influencerId: id, expiresAt: { lt: new Date() } } }),
      this.prisma.commissionLedger.groupBy({
        by: ['status'],
        where: { influencerId: id },
        _sum: { amountBase: true, commissionAmount: true },
      }),
    ]);
    return { influencerId: id, customersCount, expiredAttributionCount, totals };
  }

  private audit(adminId: string, action: string, entityType: string, entityId: string, metadata: unknown, request: Request) {
    return this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action,
      entityType,
      entityId,
      metadata: metadata as Prisma.InputJsonObject,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  private validateCodeDates(startsAt?: string, endsAt?: string) {
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      throw new AppException('Referral code end must be after start', 'INVALID_REFERRAL_CODE_DATES', HttpStatus.BAD_REQUEST);
    }
  }

  private toCommissionResponse(item: any) {
    return {
      ...item,
      saleAmount: item.amountBase == null ? null : new Prisma.Decimal(item.amountBase).toFixed(2),
      amountBase: item.amountBase == null ? null : new Prisma.Decimal(item.amountBase).toFixed(2),
      commissionRate: item.commissionRate == null ? null : new Prisma.Decimal(item.commissionRate).toFixed(2),
      commissionAmount: item.commissionAmount == null ? null : new Prisma.Decimal(item.commissionAmount).toFixed(2),
      orderId: item.orderItem?.orderId ?? item.orderItem?.order?.id ?? null,
      saleSource: item.orderItem?.source ?? null,
    };
  }
}
