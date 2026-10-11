/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DevicePlatform, NotificationType, PushDeliveryStatus } from '@prisma/client';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { TOKEN_TYPES_KEY } from 'src/common/decorators/token-type.decorator';
import { TokenType } from 'src/common/enums/token-type.enum';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { CustomerDevicesController } from 'src/notifications/customer-devices.controller';
import { CustomerDevicesService } from 'src/notifications/customer-devices.service';
import { TransientPushError } from 'src/notifications/firebase-push.provider';
import { NoopPushProvider } from 'src/notifications/noop-push.provider';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PUSH_DELIVERY_JOB } from 'src/notifications/push-delivery.constants';
import { PushDeliveryProcessor } from 'src/notifications/push-delivery.processor';
import { PushDeliveryService } from 'src/notifications/push-delivery.service';

const dto = {
  installationId: 'installation-1234567890',
  platform: DevicePlatform.ANDROID,
  token: 'sensitive-push-token-1234567890',
  preferredLocale: 'ar' as const,
};

const persistedNotification = {
  id: 'notification-1',
  customerId: 'customer-1',
  campaignId: null,
  type: NotificationType.SYSTEM,
  title: 'العنوان',
  body: 'النص',
  data: {
    titleAr: 'العنوان',
    bodyAr: 'النص',
    titleEn: 'Title',
    bodyEn: 'Body',
    linkType: 'PRODUCT',
    linkTargetId: 'product-1',
  },
  readAt: null,
  createdAt: new Date('2026-08-12T00:00:00.000Z'),
};

function devicePrisma() {
  const tx = {
    customerDevice: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({
        installationId: dto.installationId,
        platform: dto.platform,
        preferredLocale: dto.preferredLocale,
        enabled: true,
        updatedAt: new Date('2026-08-12T00:00:00.000Z'),
      }),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)),
      customerDevice: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    },
  };
}

function deliveryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'delivery-1',
    notificationId: persistedNotification.id,
    customerDeviceId: 'device-1',
    status: PushDeliveryStatus.QUEUED,
    device: {
      id: 'device-1',
      enabled: true,
      pushToken: dto.token,
      preferredLocale: 'en',
    },
    notification: persistedNotification,
    ...overrides,
  };
}

function processorHarness(options: {
  delivery?: Record<string, unknown>;
  sendResult?: unknown;
  sendError?: unknown;
}) {
  const updateDelivery = jest.fn().mockResolvedValue({});
  const updateNotification = jest.fn().mockResolvedValue({});
  const updateDevice = jest.fn().mockResolvedValue({});
  const prisma = {
    notificationPushDelivery: {
      findUnique: jest.fn().mockResolvedValue(options.delivery ?? deliveryRecord()),
      update: updateDelivery,
    },
    notification: { update: updateNotification },
    customerDevice: { update: updateDevice },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const send = options.sendError
    ? jest.fn().mockRejectedValue(options.sendError)
    : jest.fn().mockResolvedValue(options.sendResult ?? { status: 'SENT' });
  const refreshCampaignCounts = jest.fn().mockResolvedValue(undefined);
  const processor = new PushDeliveryProcessor(
    prisma as any,
    { enabled: true, send },
    { refreshCampaignCounts } as any,
  );
  return { processor, prisma, send, updateDelivery, updateDevice };
}

function job(attemptsMade = 0) {
  return {
    name: PUSH_DELIVERY_JOB,
    data: { deliveryId: 'delivery-1' },
    attemptsMade,
    opts: { attempts: 4 },
  } as any;
}

describe('Mobile Phase F push contracts', () => {
  it('requires customer access authentication on the device controller', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CustomerDevicesController) as unknown[];
    expect(guards).toContain(JwtAccessGuard);
    expect(Reflect.getMetadata(TOKEN_TYPES_KEY, CustomerDevicesController)).toEqual([
      TokenType.Customer,
    ]);
  });

  it('derives device ownership from the authenticated customer', async () => {
    const service = { register: jest.fn().mockResolvedValue({}) };
    const controller = new CustomerDevicesController(service as any);
    await controller.register({ id: 'authenticated-customer' } as any, dto);
    expect(service.register).toHaveBeenCalledWith('authenticated-customer', dto);
    expect(dto).not.toHaveProperty('customerId');
  });

  it('upserts token rotation for the same installation', async () => {
    const { prisma, tx } = devicePrisma();
    await new CustomerDevicesService(prisma as any).register('customer-1', dto);
    expect(tx.customerDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { installationId: dto.installationId },
        update: expect.objectContaining({ customerId: 'customer-1', pushToken: dto.token }),
      }),
    );
  });

  it('reassigns a rotated provider token away from an old installation', async () => {
    const { prisma, tx } = devicePrisma();
    await new CustomerDevicesService(prisma as any).register('customer-1', dto);
    expect(tx.customerDevice.deleteMany).toHaveBeenCalledWith({
      where: { pushToken: dto.token, installationId: { not: dto.installationId } },
    });
  });

  it('supports multiple installations without a customer-wide delete', async () => {
    const { prisma, tx } = devicePrisma();
    const service = new CustomerDevicesService(prisma as any);
    await service.register('customer-1', dto);
    await service.register('customer-1', { ...dto, installationId: 'installation-abcdefghij' });
    expect(tx.customerDevice.upsert).toHaveBeenCalledTimes(2);
    expect(tx.customerDevice.deleteMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: 'customer-1' } }),
    );
  });

  it('unregisters only the authenticated customer installation', async () => {
    const { prisma } = devicePrisma();
    await new CustomerDevicesService(prisma as any).unregister('customer-1', dto.installationId);
    expect(prisma.customerDevice.deleteMany).toHaveBeenCalledWith({
      where: { customerId: 'customer-1', installationId: dto.installationId },
    });
  });

  it('keeps the explicit disabled provider from reporting fake success', async () => {
    const provider = new NoopPushProvider();
    expect(provider.enabled).toBe(false);
    await expect(provider.send()).resolves.toEqual({
      status: 'PERMANENT_FAILURE',
      code: 'PUSH_PROVIDER_DISABLED',
    });
  });

  it('keeps a persisted notification when push enqueue fails', async () => {
    const prisma = {
      customerNotificationSettings: { upsert: jest.fn().mockResolvedValue({ system: true }) },
      notification: { create: jest.fn().mockResolvedValue(persistedNotification) },
    };
    const service = new NotificationsService(
      prisma as any,
      { emitToCustomer: jest.fn() } as any,
      {
        enqueueNotification: jest.fn().mockRejectedValue(new Error('provider unavailable')),
      } as any,
    );
    await expect(
      service.createForCustomer({
        customerId: 'customer-1',
        type: NotificationType.SYSTEM,
        title: 'العنوان',
        body: 'النص',
      }),
    ).resolves.toMatchObject({ id: persistedNotification.id });
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('routes system-generated persisted notifications through the delivery service', async () => {
    const enqueueNotification = jest.fn().mockResolvedValue({ queued: 1, noDevice: 0 });
    const prisma = {
      customerNotificationSettings: { upsert: jest.fn().mockResolvedValue({ system: true }) },
      notification: { create: jest.fn().mockResolvedValue(persistedNotification) },
    };
    const service = new NotificationsService(
      prisma as any,
      { emitToCustomer: jest.fn() } as any,
      { enqueueNotification } as any,
    );
    await service.createForCustomer({
      customerId: 'customer-1',
      type: NotificationType.SYSTEM,
      title: 'العنوان',
      body: 'النص',
    });
    expect(enqueueNotification).toHaveBeenCalledWith(persistedNotification.id);
  });

  it('reports no device without invalidating the persisted notification', async () => {
    const service = new PushDeliveryService(
      {
        notification: {
          findUnique: jest.fn().mockResolvedValue({ id: 'notification-1', customerId: 'c-1' }),
        },
        customerDevice: { findMany: jest.fn().mockResolvedValue([]) },
      } as any,
      { addBulk: jest.fn() } as any,
      { enabled: true, send: jest.fn() },
    );
    await expect(service.enqueueNotification('notification-1')).resolves.toEqual({
      queued: 0,
      noDevice: 1,
    });
  });

  it('configures bounded exponential queue retry', async () => {
    const addBulk = jest.fn().mockResolvedValue(undefined);
    const service = new PushDeliveryService(
      {
        notification: {
          findUnique: jest.fn().mockResolvedValue({ id: 'notification-1', customerId: 'c-1' }),
        },
        customerDevice: { findMany: jest.fn().mockResolvedValue([{ id: 'device-1' }]) },
        notificationPushDelivery: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
          findMany: jest.fn().mockResolvedValue([{ id: 'delivery-1' }]),
        },
      } as any,
      { addBulk } as any,
      { enabled: true, send: jest.fn() },
    );
    await service.enqueueNotification('notification-1');
    expect(addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        opts: expect.objectContaining({
          attempts: 4,
          backoff: { type: 'exponential', delay: 2000 },
        }),
      }),
    ]);
  });

  it('disables an invalid token and stops retrying it', async () => {
    const harness = processorHarness({
      sendResult: { status: 'INVALID_TOKEN', code: 'messaging/registration-token-not-registered' },
    });
    await harness.processor.process(job());
    expect(harness.updateDevice).toHaveBeenCalledWith({
      where: { id: 'device-1' },
      data: { enabled: false },
    });
    expect(harness.updateDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PushDeliveryStatus.FAILED }),
      }),
    );
  });

  it('rethrows a transient failure before the bounded final attempt', async () => {
    const harness = processorHarness({
      sendError: new TransientPushError('messaging/internal-error'),
    });
    await expect(harness.processor.process(job(0))).rejects.toBeInstanceOf(TransientPushError);
    expect(harness.updateDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failureCode: 'messaging/internal-error' }),
      }),
    );
  });

  it('marks a transient failure permanent on the final attempt', async () => {
    const harness = processorHarness({
      sendError: new TransientPushError('messaging/internal-error'),
    });
    await expect(harness.processor.process(job(3))).resolves.toBeUndefined();
    expect(harness.updateDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PushDeliveryStatus.FAILED }),
      }),
    );
  });

  it('selects localized English payload content with safe fallback support', async () => {
    const harness = processorHarness({});
    await harness.processor.process(job());
    expect(harness.send).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Title', body: 'Body' }),
    );
  });

  it.each([
    ['PRODUCT', 'product-1'],
    ['AUCTION', 'auction-1'],
    ['CATEGORY', 'category-1'],
  ])('emits the minimal %s destination payload', async (linkType, linkTargetId) => {
    const harness = processorHarness({
      delivery: deliveryRecord({
        notification: {
          ...persistedNotification,
          data: { linkType, linkTargetId },
        },
      }),
    });
    await harness.processor.process(job());
    expect(harness.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          notificationId: persistedNotification.id,
          linkType,
          linkTargetId,
        },
      }),
    );
  });

  it('serializes every Firebase routing data value as a string', async () => {
    const harness = processorHarness({
      delivery: deliveryRecord({
        notification: {
          ...persistedNotification,
          data: { linkType: 'AUCTION', linkTargetId: 'auction-1' },
        },
      }),
    });
    await harness.processor.process(job());
    const input = harness.send.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(input.data).toEqual({
      notificationId: persistedNotification.id,
      linkType: 'AUCTION',
      linkTargetId: 'auction-1',
    });
    expect(Object.values(input.data).every((value) => typeof value === 'string')).toBe(true);
  });

  it('rejects historical Live routing from the push payload contract', async () => {
    const harness = processorHarness({
      delivery: deliveryRecord({
        notification: {
          ...persistedNotification,
          data: { linkType: 'LIVE', linkTargetId: 'live-1' },
        },
      }),
    });
    await harness.processor.process(job());
    expect(harness.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ linkType: 'NONE', linkTargetId: '' }),
      }),
    );
  });

  it('redacts push tokens from audit metadata', async () => {
    const create = jest.fn().mockResolvedValue({});
    const service = new AuditLogsService({ auditLog: { create } } as any);
    await service.create({
      actorType: 'CUSTOMER',
      actorId: 'customer-1',
      action: 'DEVICE_REGISTERED',
      entityType: 'CustomerDevice',
      metadata: { pushToken: dto.token, nested: { registration_token: dto.token } },
    });
    const metadata = create.mock.calls[0][0].data.metadata;
    expect(metadata).toEqual({
      pushToken: '[REDACTED]',
      nested: { registration_token: '[REDACTED]' },
    });
    expect(JSON.stringify(metadata)).not.toContain(dto.token);
  });
});
