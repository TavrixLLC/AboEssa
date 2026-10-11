import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import {
  ActorType,
  AuctionStatus,
  CustomerStatus,
  NotificationAudienceType,
  NotificationCampaignStatus,
  NotificationLinkType,
  NotificationType,
  Prisma,
  ProductListingStatus,
  VerificationStatus,
} from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { AppException } from 'src/common/exceptions/app.exception';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import {
  AdminNotificationHistoryQueryDto,
  AudiencePreviewDto,
  SendAdminNotificationDto,
} from 'src/notifications/dto/admin-notification.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { SocketsService } from 'src/sockets/sockets.service';
import { PushDeliveryService } from 'src/notifications/push-delivery.service';

const DELIVERY_BATCH_SIZE = 500;

@Injectable()
export class AdminNotificationsService {
  private readonly logger = new Logger(AdminNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly sockets: SocketsService,
    @Optional() private readonly pushDelivery?: PushDeliveryService,
  ) {}

  async preview(dto: AudiencePreviewDto) {
    const audience = await this.resolveAudience(dto);
    return {
      recipientCount: audience.customerIds.length,
      selectedCustomers: audience.selectedCustomers,
    };
  }

  async send(
    dto: SendAdminNotificationDto,
    adminId: string,
    idempotencyKey: string,
    requestHash: string,
    request: Request,
  ) {
    const existing = await this.prisma.notificationCampaign.findUnique({
      where: {
        createdByAdminId_idempotencyKey: {
          createdByAdminId: adminId,
          idempotencyKey,
        },
      },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AppException(
          'Idempotency key was already used with a different request body',
          'IDEMPOTENCY_CONFLICT',
          HttpStatus.CONFLICT,
        );
      }
      return this.sendResult(existing);
    }
    await this.validateDestination(dto.linkType ?? NotificationLinkType.NONE, dto.linkTargetId);
    const audience = await this.resolveAudience(dto);
    if (audience.customerIds.length === 0) {
      throw new AppException(
        'The selected audience has no eligible customers',
        'NOTIFICATION_AUDIENCE_EMPTY',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const campaign = await this.prisma.$transaction(async (tx) => {
        const created = await tx.notificationCampaign.create({
          data: {
            createdByAdminId: adminId,
            idempotencyKey,
            requestHash,
            titleAr: dto.titleAr,
            titleEn: dto.titleEn,
            bodyAr: dto.bodyAr,
            bodyEn: dto.bodyEn,
            audienceType: dto.audienceType,
            audienceMetadata: this.audienceMetadata(dto, audience.customerIds),
            linkType: dto.linkType ?? NotificationLinkType.NONE,
            linkTargetId: dto.linkTargetId,
            recipientCount: audience.customerIds.length,
            status: NotificationCampaignStatus.SENT,
          },
        });

        let createdCount = 0;
        const metadata = {
          campaignId: created.id,
          titleAr: dto.titleAr,
          titleEn: dto.titleEn ?? dto.titleAr,
          bodyAr: dto.bodyAr,
          bodyEn: dto.bodyEn ?? dto.bodyAr,
          linkType: dto.linkType ?? NotificationLinkType.NONE,
          linkTargetId: dto.linkTargetId ?? null,
        } satisfies Prisma.InputJsonObject;

        for (let offset = 0; offset < audience.customerIds.length; offset += DELIVERY_BATCH_SIZE) {
          const batch = audience.customerIds.slice(offset, offset + DELIVERY_BATCH_SIZE);
          const result = await tx.notification.createMany({
            data: batch.map((customerId) => ({
              customerId,
              campaignId: created.id,
              type: NotificationType.SYSTEM,
              title: dto.titleAr || dto.titleEn!,
              body: dto.bodyAr || dto.bodyEn!,
              data: metadata,
            })),
          });
          createdCount += result.count;
        }

        const failureCount = audience.customerIds.length - createdCount;
        return tx.notificationCampaign.update({
          where: { id: created.id },
          data: {
            createdCount,
            failureCount,
            status:
              failureCount === 0
                ? NotificationCampaignStatus.SENT
                : NotificationCampaignStatus.PARTIAL,
          },
        });
      });

      await this.auditLogs.create({
        actorType: ActorType.ADMIN,
        actorId: adminId,
        action: 'notification_campaign.sent',
        entityType: 'NotificationCampaign',
        entityId: campaign.id,
        metadata: {
          audienceType: campaign.audienceType,
          recipientCount: campaign.recipientCount,
          linkType: campaign.linkType,
        },
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      this.sockets.emitNotificationRefresh(audience.customerIds, campaign.id);
      if (this.pushDelivery) {
        try {
          await this.pushDelivery.enqueueCampaign(campaign.id);
        } catch {
          this.logger.error(`Push enqueue failed safely for campaign ${campaign.id}`);
        }
      }
      if (!this.pushDelivery) return this.sendResult(campaign);
      const withDelivery = await this.prisma.notificationCampaign.findUnique({
        where: { id: campaign.id },
      });
      return this.sendResult(withDelivery ?? campaign);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.replay(adminId, idempotencyKey, requestHash);
      }
      throw error;
    }
  }

  async list(query: AdminNotificationHistoryQueryDto) {
    const pagination = getPagination(query);
    const where: Prisma.NotificationCampaignWhereInput = {
      audienceType: query.audienceType,
      status: query.status,
      OR: query.q
        ? [
            { titleAr: { contains: query.q, mode: 'insensitive' } },
            { titleEn: { contains: query.q, mode: 'insensitive' } },
            { bodyAr: { contains: query.q, mode: 'insensitive' } },
            { bodyEn: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationCampaign.findMany({
        where,
        include: { createdByAdmin: { select: { id: true, name: true, displayName: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.notificationCampaign.count({ where }),
    ]);
    return toPaginatedResult(
      items.map((campaign) => this.toCampaignResponse(campaign)),
      total,
      pagination.page,
      pagination.limit,
    );
  }

  async details(id: string) {
    const campaign = await this.prisma.notificationCampaign.findUnique({
      where: { id },
      include: { createdByAdmin: { select: { id: true, name: true, displayName: true } } },
    });
    if (!campaign) {
      throw new AppException(
        'Notification campaign was not found',
        'NOTIFICATION_CAMPAIGN_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.toCampaignResponse(campaign);
  }

  private async resolveAudience(dto: AudiencePreviewDto) {
    this.validateAudienceShape(dto);
    const where = this.audienceWhere(dto);
    const customers = await this.prisma.customer.findMany({
      where,
      select: { id: true, displayName: true, phone: true },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    });

    if (dto.audienceType === NotificationAudienceType.ONE_CUSTOMER && customers.length !== 1) {
      throw new AppException(
        'The customer is not eligible for notifications',
        'NOTIFICATION_CUSTOMER_INELIGIBLE',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.audienceType === NotificationAudienceType.SELECTED_CUSTOMERS) {
      const requested = new Set(dto.customerIds);
      if (customers.length !== requested.size) {
        throw new AppException(
          'One or more selected customers are not eligible for notifications',
          'NOTIFICATION_CUSTOMER_INELIGIBLE',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    return {
      customerIds: customers.map((customer) => customer.id),
      selectedCustomers:
        dto.audienceType === NotificationAudienceType.ONE_CUSTOMER ||
        dto.audienceType === NotificationAudienceType.SELECTED_CUSTOMERS
          ? customers
          : [],
    };
  }

  private audienceWhere(dto: AudiencePreviewDto): Prisma.CustomerWhereInput {
    const eligible: Prisma.CustomerWhereInput = {
      status: CustomerStatus.ACTIVE,
      isVirtual: false,
    };
    switch (dto.audienceType) {
      case NotificationAudienceType.ONE_CUSTOMER:
        return { ...eligible, id: dto.customerId };
      case NotificationAudienceType.SELECTED_CUSTOMERS:
        return { ...eligible, id: { in: dto.customerIds } };
      case NotificationAudienceType.VERIFIED_CUSTOMERS:
        return { ...eligible, verificationStatus: VerificationStatus.VERIFIED };
      case NotificationAudienceType.UNVERIFIED_CUSTOMERS:
        return { ...eligible, verificationStatus: VerificationStatus.UNVERIFIED };
      case NotificationAudienceType.ALL_ACTIVE_CUSTOMERS:
        return eligible;
    }
  }

  private validateAudienceShape(dto: AudiencePreviewDto) {
    if (dto.audienceType !== NotificationAudienceType.ONE_CUSTOMER && dto.customerId) {
      throw new AppException(
        'customerId is only allowed for ONE_CUSTOMER',
        'INVALID_NOTIFICATION_AUDIENCE',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      dto.audienceType !== NotificationAudienceType.SELECTED_CUSTOMERS &&
      dto.customerIds?.length
    ) {
      throw new AppException(
        'customerIds is only allowed for SELECTED_CUSTOMERS',
        'INVALID_NOTIFICATION_AUDIENCE',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async validateDestination(linkType: NotificationLinkType, targetId?: string) {
    if (!Object.values(NotificationLinkType).includes(linkType)) {
      throw new AppException(
        'The notification destination is not supported',
        'INVALID_NOTIFICATION_DESTINATION',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (linkType === NotificationLinkType.NONE) {
      if (targetId) {
        throw new AppException(
          'A target is not allowed for NONE destinations',
          'INVALID_NOTIFICATION_DESTINATION',
          HttpStatus.BAD_REQUEST,
        );
      }
      return;
    }
    if (!targetId) {
      throw new AppException(
        'A destination target is required',
        'INVALID_NOTIFICATION_DESTINATION',
        HttpStatus.BAD_REQUEST,
      );
    }
    const exists =
      linkType === NotificationLinkType.PRODUCT
        ? await this.prisma.productListing.findFirst({
            where: {
              id: targetId,
              status: ProductListingStatus.ACTIVE,
              availableQuantity: { gt: 0 },
            },
            select: { id: true },
          })
        : linkType === NotificationLinkType.AUCTION
          ? await this.prisma.auction.findFirst({
              where: { id: targetId, status: AuctionStatus.ACTIVE },
              select: { id: true },
            })
          : await this.prisma.category.findFirst({
              where: { id: targetId, isActive: true },
              select: { id: true },
            });
    if (!exists) {
      throw new AppException(
        'The notification destination is unavailable',
        'NOTIFICATION_DESTINATION_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private audienceMetadata(dto: SendAdminNotificationDto, customerIds: string[]) {
    if (dto.audienceType === NotificationAudienceType.ONE_CUSTOMER) {
      return { customerId: customerIds[0] } satisfies Prisma.InputJsonObject;
    }
    if (dto.audienceType === NotificationAudienceType.SELECTED_CUSTOMERS) {
      return {
        selectedCustomerIds: customerIds,
        selectionCount: customerIds.length,
      } satisfies Prisma.InputJsonObject;
    }
    return { recipientCount: customerIds.length } satisfies Prisma.InputJsonObject;
  }

  private async replay(adminId: string, idempotencyKey: string, requestHash: string) {
    const campaign = await this.prisma.notificationCampaign.findUnique({
      where: { createdByAdminId_idempotencyKey: { createdByAdminId: adminId, idempotencyKey } },
    });
    if (!campaign || campaign.requestHash !== requestHash) {
      throw new AppException(
        'Idempotency key was already used with a different request body',
        'IDEMPOTENCY_CONFLICT',
        HttpStatus.CONFLICT,
      );
    }
    return this.sendResult(campaign);
  }

  private sendResult(campaign: {
    id: string;
    recipientCount: number;
    createdCount: number;
    failureCount: number;
    status: NotificationCampaignStatus;
    pushQueuedCount?: number;
    pushSuccessCount?: number;
    pushFailureCount?: number;
    noDeviceCount?: number;
  }) {
    return {
      campaignId: campaign.id,
      recipientCount: campaign.recipientCount,
      createdCount: campaign.createdCount,
      failedCount: campaign.failureCount,
      status: campaign.status,
      pushProviderEnabled: this.pushDelivery?.providerEnabled ?? false,
      pushQueuedCount: campaign.pushQueuedCount ?? 0,
      pushSuccessCount: campaign.pushSuccessCount ?? 0,
      pushFailureCount: campaign.pushFailureCount ?? 0,
      noDeviceCount: campaign.noDeviceCount ?? 0,
    };
  }

  private toCampaignResponse(campaign: {
    id: string;
    titleAr: string;
    titleEn: string | null;
    bodyAr: string;
    bodyEn: string | null;
    audienceType: NotificationAudienceType;
    audienceMetadata: Prisma.JsonValue | null;
    linkType: NotificationLinkType;
    linkTargetId: string | null;
    recipientCount: number;
    createdCount: number;
    failureCount: number;
    status: NotificationCampaignStatus;
    pushQueuedCount: number;
    pushSuccessCount: number;
    pushFailureCount: number;
    noDeviceCount: number;
    createdAt: Date;
    createdByAdmin: { id: string; name: string; displayName: string | null };
  }) {
    return {
      id: campaign.id,
      titleAr: campaign.titleAr,
      titleEn: campaign.titleEn,
      bodyAr: campaign.bodyAr,
      bodyEn: campaign.bodyEn,
      audienceType: campaign.audienceType,
      audienceMetadata: campaign.audienceMetadata,
      linkType: campaign.linkType,
      linkTargetId: campaign.linkTargetId,
      recipientCount: campaign.recipientCount,
      createdCount: campaign.createdCount,
      failureCount: campaign.failureCount,
      status: campaign.status,
      pushProviderEnabled: this.pushDelivery?.providerEnabled ?? false,
      pushQueuedCount: campaign.pushQueuedCount,
      pushSuccessCount: campaign.pushSuccessCount,
      pushFailureCount: campaign.pushFailureCount,
      noDeviceCount: campaign.noDeviceCount,
      sender: {
        id: campaign.createdByAdmin.id,
        name: campaign.createdByAdmin.displayName || campaign.createdByAdmin.name,
      },
      createdAt: campaign.createdAt,
    };
  }
}
