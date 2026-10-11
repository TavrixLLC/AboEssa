import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PushDeliveryStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { TransientPushError } from 'src/notifications/firebase-push.provider';
import { PUSH_DELIVERY_JOB, PUSH_DELIVERY_QUEUE } from 'src/notifications/push-delivery.constants';
import { PushDeliveryService } from 'src/notifications/push-delivery.service';
import { PUSH_PROVIDER, PushProvider } from 'src/notifications/push-provider.interface';
import { PrismaService } from 'src/prisma/prisma.service';

@Processor(PUSH_DELIVERY_QUEUE)
export class PushDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(PushDeliveryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
    private readonly deliveryService: PushDeliveryService,
  ) {
    super();
  }

  async process(job: Job<{ deliveryId: string }>) {
    if (job.name !== PUSH_DELIVERY_JOB) return;
    const delivery = await this.prisma.notificationPushDelivery.findUnique({
      where: { id: job.data.deliveryId },
      include: { device: true, notification: true },
    });
    if (!delivery || delivery.status !== PushDeliveryStatus.QUEUED) return;
    if (!delivery.device.enabled) {
      await this.fail(delivery.id, 'DEVICE_DISABLED', delivery.notification.campaignId);
      return;
    }

    try {
      const localized = this.localized(delivery.notification, delivery.device.preferredLocale);
      const result = await this.provider.send({
        token: delivery.device.pushToken,
        title: localized.title,
        body: localized.body,
        data: this.safePayload(delivery.notification),
      });
      if (result.status === 'SENT') {
        await this.prisma.$transaction([
          this.prisma.notificationPushDelivery.update({
            where: { id: delivery.id },
            data: {
              status: PushDeliveryStatus.SENT,
              sentAt: new Date(),
              attemptCount: { increment: 1 },
              failureCode: null,
            },
          }),
          this.prisma.notification.update({
            where: { id: delivery.notificationId },
            data: { pushSentAt: new Date() },
          }),
        ]);
      } else {
        if (result.status === 'INVALID_TOKEN') {
          await this.prisma.customerDevice.update({
            where: { id: delivery.customerDeviceId },
            data: { enabled: false },
          });
        }
        await this.fail(delivery.id, result.code, delivery.notification.campaignId);
        return;
      }
    } catch (error) {
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (error instanceof TransientPushError && !finalAttempt) {
        await this.prisma.notificationPushDelivery.update({
          where: { id: delivery.id },
          data: { attemptCount: { increment: 1 }, failureCode: error.safeCode },
        });
        throw error;
      }
      await this.fail(
        delivery.id,
        error instanceof TransientPushError ? error.safeCode : 'PUSH_DELIVERY_ERROR',
        delivery.notification.campaignId,
      );
      this.logger.error(`Push delivery ${delivery.id} failed permanently`);
      return;
    }

    if (delivery.notification.campaignId) {
      await this.deliveryService.refreshCampaignCounts(delivery.notification.campaignId);
    }
  }

  private async fail(deliveryId: string, code: string, campaignId: string | null) {
    await this.prisma.notificationPushDelivery.update({
      where: { id: deliveryId },
      data: {
        status: PushDeliveryStatus.FAILED,
        attemptCount: { increment: 1 },
        failureCode: code.slice(0, 100),
      },
    });
    if (campaignId) await this.deliveryService.refreshCampaignCounts(campaignId);
  }

  private localized(
    notification: { title: string; body: string; data: unknown },
    locale: string,
  ) {
    const data = this.objectData(notification.data);
    const english = locale === 'en';
    return {
      title: this.text(data, english ? 'titleEn' : 'titleAr') || notification.title,
      body: this.text(data, english ? 'bodyEn' : 'bodyAr') || notification.body,
    };
  }

  private safePayload(notification: { id: string; data: unknown }) {
    const data = this.objectData(notification.data);
    const linkType = ['NONE', 'PRODUCT', 'AUCTION', 'CATEGORY'].includes(
      String(data?.linkType),
    )
      ? String(data?.linkType)
      : 'NONE';
    const target = linkType === 'NONE' ? '' : this.text(data, 'linkTargetId');
    return {
      notificationId: notification.id,
      linkType,
      linkTargetId: target,
    };
  }

  private objectData(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private text(data: Record<string, unknown> | undefined, key: string) {
    const value = data?.[key];
    return typeof value === 'string' ? value : '';
  }
}
