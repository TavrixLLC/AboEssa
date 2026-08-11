import { HttpStatus, Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { AppException } from 'src/common/exceptions/app.exception';
import { NotificationQueryDto } from 'src/notifications/dto/notification-query.dto';
import { NotificationResponseDto } from 'src/notifications/dto/notification-response.dto';
import { UpdateNotificationSettingsDto } from 'src/notifications/dto/update-notification-settings.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { SocketsService } from 'src/sockets/sockets.service';

const preferenceByType: Partial<Record<NotificationType, keyof UpdateNotificationSettingsDto>> = {
  BID_OUTBID: 'auctionOutbid',
  AUCTION_ENDING_SOON: 'auctionEndingSoon',
  AUCTION_WON: 'auctionWon',
  AUCTION_LOST: 'auctionWon',
  ORDER_UPDATED: 'orderUpdates',
  VERIFICATION_UPDATED: 'system',
  AD: 'ads',
  SYSTEM: 'system',
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sockets: SocketsService,
  ) {}

  async createForCustomer(input: {
    customerId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Prisma.InputJsonValue;
  }) {
    const settings = await this.prisma.customerNotificationSettings.upsert({
      where: { customerId: input.customerId },
      create: { customerId: input.customerId },
      update: {},
    });
    const preference = preferenceByType[input.type];
    if (preference && settings[preference] === false) {
      return null;
    }

    const notification = await this.prisma.notification.create({
      data: {
        customerId: input.customerId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data,
      },
    });
    const response = this.toNotificationResponse(notification);
    this.sockets.emitToCustomer(input.customerId, 'notification', {
      ...response,
      notificationId: response.id,
    });
    return response;
  }

  async listCustomer(customerId: string, query: NotificationQueryDto) {
    const pagination = getPagination(query);
    const where: Prisma.NotificationWhereInput = {
      customerId,
      readAt: query.unreadOnly ? null : undefined,
      type: query.type,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      ...toPaginatedResult(
        items.map((notification) => this.toNotificationResponse(notification)),
        total,
        pagination.page,
        pagination.limit,
      ),
      unreadCount: await this.unreadCountValue(customerId),
    };
  }

  async unreadCount(customerId: string) {
    return { count: await this.unreadCountValue(customerId) };
  }

  async readBatch(customerId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids ?? [])];
    if (uniqueIds.length === 0) return { updatedCount: 0 };
    const result = await this.prisma.notification.updateMany({
      where: { id: { in: uniqueIds }, customerId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updatedCount: result.count };
  }

  async markRead(customerId: string, id: string) {
    try {
      await this.prisma.notification.update({
        where: { id, customerId },
        data: { readAt: new Date() },
      });
    } catch {
      throw new AppException(
        'Notification was not found',
        'NOTIFICATION_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return { id, read: true };
  }

  private unreadCountValue(customerId: string) {
    return this.prisma.notification.count({ where: { customerId, readAt: null } });
  }

  getSettings(customerId: string) {
    return this.prisma.customerNotificationSettings.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
    });
  }

  updateSettings(customerId: string, dto: UpdateNotificationSettingsDto) {
    return this.prisma.customerNotificationSettings.upsert({
      where: { customerId },
      create: { customerId, ...dto },
      update: dto,
    });
  }

  private toNotificationResponse(notification: {
    id: string;
    title: string;
    body: string;
    type: NotificationType;
    data: Prisma.JsonValue | null;
    readAt: Date | null;
    createdAt: Date;
  }): NotificationResponseDto {
    const data = this.objectData(notification.data);
    const historicalLiveLink = data?.linkType === 'LIVE';
    const safeMetadata = historicalLiveLink
      ? { ...data, linkType: 'NONE', linkTargetId: null }
      : notification.data;
    return {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      titleAr: typeof data?.titleAr === 'string' ? data.titleAr : notification.title,
      titleEn: typeof data?.titleEn === 'string' ? data.titleEn : null,
      bodyAr: typeof data?.bodyAr === 'string' ? data.bodyAr : notification.body,
      bodyEn: typeof data?.bodyEn === 'string' ? data.bodyEn : null,
      type: notification.type,
      isRead: Boolean(notification.readAt),
      createdAt: notification.createdAt,
      linkType: !historicalLiveLink && typeof data?.linkType === 'string' ? data.linkType : null,
      linkTargetId:
        !historicalLiveLink && typeof data?.linkTargetId === 'string' ? data.linkTargetId : null,
      metadata: safeMetadata,
    };
  }

  private objectData(data: Prisma.JsonValue | null) {
    return data && typeof data === 'object' && !Array.isArray(data) ? data : undefined;
  }
}
