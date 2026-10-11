import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PushDeliveryStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PUSH_DELIVERY_JOB, PUSH_DELIVERY_QUEUE } from 'src/notifications/push-delivery.constants';
import { PUSH_PROVIDER, PushProvider } from 'src/notifications/push-provider.interface';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PushDeliveryService implements OnModuleInit {
  private readonly logger = new Logger(PushDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PUSH_DELIVERY_QUEUE) private readonly queue: Queue,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
  ) {}

  onModuleInit() {
    this.logger.log(
      this.provider.enabled
        ? 'Native push provider is configured'
        : 'Native push provider is disabled/not configured; persisted notifications remain active',
    );
  }

  get providerEnabled() {
    return this.provider.enabled;
  }

  async enqueueNotification(notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, customerId: true },
    });
    if (!notification?.customerId) return { queued: 0, noDevice: 0 };

    const devices = await this.prisma.customerDevice.findMany({
      where: { customerId: notification.customerId, enabled: true },
      select: { id: true },
    });
    if (devices.length === 0) return { queued: 0, noDevice: 1 };
    if (!this.provider.enabled) return { queued: 0, noDevice: 0 };

    await this.prisma.notificationPushDelivery.createMany({
      data: devices.map((device) => ({
        notificationId,
        customerDeviceId: device.id,
      })),
      skipDuplicates: true,
    });
    const queued = await this.prisma.notificationPushDelivery.findMany({
      where: {
        notificationId,
        customerDeviceId: { in: devices.map((device) => device.id) },
        status: PushDeliveryStatus.QUEUED,
      },
      select: { id: true },
    });
    if (queued.length > 0) {
      await this.queue.addBulk(
        queued.map((delivery) => ({
          name: PUSH_DELIVERY_JOB,
          data: { deliveryId: delivery.id },
          opts: {
            jobId: delivery.id,
            attempts: 4,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: 1_000,
            removeOnFail: 5_000,
          },
        })),
      );
    }
    return { queued: queued.length, noDevice: 0 };
  }

  async enqueueCampaign(campaignId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { campaignId },
      select: { id: true },
    });
    let noDeviceCount = 0;
    for (const notification of notifications) {
      try {
        const result = await this.enqueueNotification(notification.id);
        noDeviceCount += result.noDevice;
      } catch {
        this.logger.error(`Push enqueue failed safely for notification ${notification.id}`);
      }
    }
    await this.refreshCampaignCounts(campaignId, noDeviceCount);
  }

  async refreshCampaignCounts(campaignId: string, noDeviceCount?: number) {
    const [pushQueuedCount, pushSuccessCount, pushFailureCount] = await Promise.all([
      this.prisma.notificationPushDelivery.count({
        where: { notification: { campaignId }, status: PushDeliveryStatus.QUEUED },
      }),
      this.prisma.notificationPushDelivery.count({
        where: { notification: { campaignId }, status: PushDeliveryStatus.SENT },
      }),
      this.prisma.notificationPushDelivery.count({
        where: { notification: { campaignId }, status: PushDeliveryStatus.FAILED },
      }),
    ]);
    await this.prisma.notificationCampaign.update({
      where: { id: campaignId },
      data: {
        pushQueuedCount,
        pushSuccessCount,
        pushFailureCount,
        noDeviceCount,
      },
    });
  }
}
