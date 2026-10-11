import { Injectable } from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { APP_SETTINGS_ID } from 'src/common/constants/app.constants';
import { UpdateAppSettingsDto } from 'src/settings/dto/update-app-settings.dto';
import { PrismaService } from 'src/prisma/prisma.service';

const defaultLabelTemplate = {
  version: 1,
  size: '70x40mm',
  fields: ['storeName', 'customerName', 'price', 'categoryName', 'barcode', 'soldAt'],
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  getSettings() {
    return this.prisma.appSettings.upsert({
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

  async updateSettings(dto: UpdateAppSettingsDto, adminId: string, request: Request) {
    const data: Prisma.AppSettingsUpdateInput = {
      storeName: dto.storeName,
      storePhone: dto.storePhone,
      storeAddress: dto.storeAddress,
      currency: dto.currency,
      allowUnverifiedPurchase: dto.allowUnverifiedPurchase,
      unverifiedPurchaseLimit: dto.unverifiedPurchaseLimit,
      allowUnverifiedBidding: dto.allowUnverifiedBidding,
      unverifiedBidLimit: dto.unverifiedBidLimit,
      defaultAuctionExtensionSeconds: dto.defaultAuctionExtensionSeconds,
      defaultAuctionExtensionTriggerSeconds: dto.defaultAuctionExtensionTriggerSeconds,
      defaultLiveAuctionResetSeconds: dto.defaultLiveAuctionResetSeconds,
      defaultLongAuctionExtensionSeconds: dto.defaultLongAuctionExtensionSeconds,
      auctionEndingSoonNotifyMinutes: dto.auctionEndingSoonNotifyMinutes,
      maxAuctionExtensions: dto.maxAuctionExtensions,
      labelTemplate: dto.labelTemplate as Prisma.InputJsonValue | undefined,
      shippingRequestEnabled: dto.shippingRequestEnabled,
    };

    const settings = await this.prisma.appSettings.upsert({
      where: { id: APP_SETTINGS_ID },
      create: {
        id: APP_SETTINGS_ID,
        storeName: dto.storeName ?? 'شناشيل',
        storePhone: dto.storePhone,
        storeAddress: dto.storeAddress,
        currency: dto.currency ?? 'IQD',
        allowUnverifiedPurchase: dto.allowUnverifiedPurchase,
        unverifiedPurchaseLimit: dto.unverifiedPurchaseLimit,
        allowUnverifiedBidding: dto.allowUnverifiedBidding,
        unverifiedBidLimit: dto.unverifiedBidLimit,
        defaultAuctionExtensionSeconds: dto.defaultAuctionExtensionSeconds,
        defaultAuctionExtensionTriggerSeconds: dto.defaultAuctionExtensionTriggerSeconds,
        defaultLiveAuctionResetSeconds: dto.defaultLiveAuctionResetSeconds,
        defaultLongAuctionExtensionSeconds: dto.defaultLongAuctionExtensionSeconds,
        auctionEndingSoonNotifyMinutes: dto.auctionEndingSoonNotifyMinutes,
        maxAuctionExtensions: dto.maxAuctionExtensions,
        labelTemplate: (dto.labelTemplate ?? defaultLabelTemplate) as Prisma.InputJsonValue,
        shippingRequestEnabled: dto.shippingRequestEnabled,
      },
      update: data,
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'settings.updated',
      entityType: 'AppSettings',
      entityId: APP_SETTINGS_ID,
      metadata: dto as unknown as Prisma.InputJsonObject,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return settings;
  }
}
