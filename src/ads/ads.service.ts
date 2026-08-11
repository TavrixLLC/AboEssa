import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActorType,
  AdLinkType,
  AdPlacement,
  AdTargetType,
  Prisma,
  VerificationStatus,
} from '@prisma/client';
import { Request } from 'express';
import { CreateAdDto } from 'src/ads/dto/create-ad.dto';
import { AdQueryDto } from 'src/ads/dto/ad-query.dto';
import { UpdateAdDto } from 'src/ads/dto/update-ad.dto';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { AppException } from 'src/common/exceptions/app.exception';
import { PrismaService } from 'src/prisma/prisma.service';
import { DECOMMISSIONED_AD_PLACEMENTS } from 'src/ads/ads.constants';

@Injectable()
export class AdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(dto: CreateAdDto, adminId: string, request: Request) {
    await this.validateTarget(dto, true);
    const ad = await this.prisma.inAppAd.create({
      data: {
        ...dto,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
        sortOrder: dto.sortOrder ?? 0,
        createdByAdminId: adminId,
      },
    });
    await this.audit(adminId, 'ad.created', ad.id, dto, request);
    return ad;
  }

  async adminList(query: AdQueryDto) {
    const pagination = getPagination(query);
    const where: Prisma.InAppAdWhereInput = { placement: query.placement };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inAppAd.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.inAppAd.count({ where }),
    ]);
    return toPaginatedResult(items, total, pagination.page, pagination.limit);
  }

  get(id: string) {
    return this.prisma.inAppAd.findUniqueOrThrow({ where: { id } });
  }

  async update(id: string, dto: UpdateAdDto, adminId: string, request: Request) {
    const existing = await this.prisma.inAppAd.findUniqueOrThrow({ where: { id } });
    await this.validateTarget(dto, false, existing);
    const ad = await this.prisma.inAppAd.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        imageUrl: dto.imageUrl,
        placement: dto.placement,
        targetType: dto.targetType,
        targetCategoryId: dto.targetCategoryId,
        linkType: dto.linkType,
        linkTargetId: dto.linkTargetId,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        isActive: dto.isActive,
        priority: dto.priority,
        sortOrder: dto.sortOrder,
      },
    });
    await this.audit(adminId, 'ad.updated', id, dto, request);
    return ad;
  }

  async deactivate(id: string, adminId: string, request: Request) {
    const ad = await this.prisma.inAppAd.update({ where: { id }, data: { isActive: false } });
    await this.audit(adminId, 'ad.deactivated', id, {}, request);
    return ad;
  }

  async customerAds(query: AdQueryDto, customerId?: string) {
    const customer = customerId
      ? await this.prisma.customer.findUnique({ where: { id: customerId } })
      : null;
    const now = new Date();
    const pagination = getPagination(query);
    const targetTypes: AdTargetType[] = [AdTargetType.ALL];
    if (customer?.verificationStatus === VerificationStatus.VERIFIED)
      targetTypes.push(AdTargetType.VERIFIED);
    if (customer?.trustLevel === 'VIP') targetTypes.push(AdTargetType.VIP);
    targetTypes.push(AdTargetType.CATEGORY_INTEREST);

    const where: Prisma.InAppAdWhereInput = {
      AND: [
        { placement: query.placement },
        { placement: { notIn: DECOMMISSIONED_AD_PLACEMENTS } },
        { linkType: { not: AdLinkType.LIVE } },
      ],
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
      OR: [
        {
          targetType: { in: targetTypes.filter((type) => type !== AdTargetType.CATEGORY_INTEREST) },
        },
        ...(query.categoryId
          ? [{ targetType: AdTargetType.CATEGORY_INTEREST, targetCategoryId: query.categoryId }]
          : []),
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inAppAd.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.inAppAd.count({ where }),
    ]);
    return toPaginatedResult(items, total, pagination.page, pagination.limit);
  }

  private audit(adminId: string, action: string, id: string, metadata: unknown, request: Request) {
    return this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action,
      entityType: 'InAppAd',
      entityId: id,
      metadata: metadata as Prisma.InputJsonObject,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  private async validateTarget(
    dto: Partial<CreateAdDto>,
    creating: boolean,
    existing?: { placement: AdPlacement; linkType: AdLinkType; isActive: boolean },
  ) {
    if (dto.placement && DECOMMISSIONED_AD_PLACEMENTS.includes(dto.placement)) {
      throw new AppException(
        'Live ad placements are no longer supported',
        'DECOMMISSIONED_AD_PLACEMENT',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.linkType === AdLinkType.LIVE) {
      throw new AppException(
        'Live ad destinations are no longer supported',
        'DECOMMISSIONED_AD_LINK_TYPE',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      !creating &&
      dto.isActive === true &&
      existing &&
      (DECOMMISSIONED_AD_PLACEMENTS.includes(existing.placement) ||
        existing.linkType === AdLinkType.LIVE)
    ) {
      throw new AppException(
        'Historical Live ads cannot be reactivated',
        'DECOMMISSIONED_AD_CANNOT_REACTIVATE',
        HttpStatus.CONFLICT,
      );
    }
    if (dto.startsAt && dto.endsAt && new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new AppException(
        'Ad end must be after start',
        'INVALID_AD_TIME',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.targetType === AdTargetType.CATEGORY_INTEREST && !dto.targetCategoryId) {
      throw new AppException(
        'Category target is required',
        'CATEGORY_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.targetType === AdTargetType.CATEGORY_INTEREST && dto.targetCategoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.targetCategoryId },
      });
      if (!category)
        throw new AppException(
          'Category was not found',
          'CATEGORY_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
    }
    if (dto.linkType === AdLinkType.NONE && dto.linkTargetId) {
      throw new AppException(
        'Link target is not allowed for NONE links',
        'INVALID_AD_LINK_TARGET',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.linkType && dto.linkType !== AdLinkType.NONE && !dto.linkTargetId) {
      throw new AppException(
        'Link target is required',
        'INVALID_AD_LINK_TARGET',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!dto.linkType || !dto.linkTargetId) return;
    if (dto.linkType === AdLinkType.EXTERNAL_URL) {
      if (!/^https?:\/\//i.test(dto.linkTargetId))
        throw new AppException(
          'External ad links must be valid http URLs',
          'INVALID_AD_LINK_TARGET',
          HttpStatus.BAD_REQUEST,
        );
      return;
    }
    const exists =
      dto.linkType === AdLinkType.CATEGORY
        ? await this.prisma.category.findUnique({ where: { id: dto.linkTargetId } })
        : dto.linkType === AdLinkType.PRODUCT
          ? await this.prisma.productListing.findUnique({ where: { id: dto.linkTargetId } })
          : dto.linkType === AdLinkType.AUCTION
            ? await this.prisma.auction.findUnique({ where: { id: dto.linkTargetId } })
            : true;
    if (!exists)
      throw new AppException(
        'Ad link target was not found',
        'AD_LINK_TARGET_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
  }
}
