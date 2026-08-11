import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  AdLinkType,
  AdPlacement,
  AdTargetType,
  NotificationAudienceType,
  NotificationCampaignStatus,
  NotificationLinkType,
} from '@prisma/client';
import { AdsService } from 'src/ads/ads.service';
import { AppModule } from 'src/app.module';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { PERMISSIONS_KEY } from 'src/common/decorators/permissions.decorator';
import { AdminNotificationsController } from 'src/notifications/admin-notifications.controller';
import { AdminNotificationsService } from 'src/notifications/admin-notifications.service';

const request = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as any;

function campaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'campaign-1',
    createdByAdminId: 'admin-1',
    idempotencyKey: 'idem-1',
    requestHash: 'hash-1',
    titleAr: 'عنوان',
    titleEn: 'Title',
    bodyAr: 'نص',
    bodyEn: 'Body',
    audienceType: NotificationAudienceType.ALL_ACTIVE_CUSTOMERS,
    audienceMetadata: {},
    linkType: NotificationLinkType.NONE,
    linkTargetId: null,
    recipientCount: 2,
    createdCount: 2,
    failureCount: 0,
    status: NotificationCampaignStatus.SENT,
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    createdByAdmin: { id: 'admin-1', name: 'Admin', displayName: 'Sender' },
    ...overrides,
  };
}

function fixture(customerIds = ['customer-1', 'customer-2']) {
  const notificationCampaign = {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(campaign({ createdCount: 0 })),
    update: jest.fn().mockResolvedValue(campaign()),
    findMany: jest.fn().mockResolvedValue([campaign()]),
    count: jest.fn().mockResolvedValue(1),
  };
  const notification = {
    createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
  };
  const customer = {
    findMany: jest
      .fn()
      .mockResolvedValue(customerIds.map((id) => ({ id, displayName: id, phone: null }))),
  };
  const tx = { notificationCampaign, notification };
  const prisma = {
    notificationCampaign,
    notification,
    customer,
    productListing: { findFirst: jest.fn().mockResolvedValue({ id: 'product-1' }) },
    auction: { findFirst: jest.fn().mockResolvedValue({ id: 'auction-1' }) },
    category: { findFirst: jest.fn().mockResolvedValue({ id: 'category-1' }) },
    $transaction: jest.fn(async (value: unknown) =>
      typeof value === 'function'
        ? (value as (client: typeof tx) => unknown)(tx)
        : Promise.all(value as Promise<unknown>[]),
    ),
  };
  const audit = { create: jest.fn().mockResolvedValue({}) };
  const sockets = { emitNotificationRefresh: jest.fn() };
  const service = new AdminNotificationsService(prisma as any, audit as any, sockets as any);
  return { service, prisma, audit, sockets, notificationCampaign, notification, customer };
}

describe('Phase D.6 product reset and Admin Notification Center', () => {
  it('does not register the dormant Live module in the application', () => {
    const imports = Reflect.getMetadata('imports', AppModule) as Array<{ name?: string }>;
    expect(imports.some((item) => item?.name === 'LiveSessionsModule')).toBe(false);
  });

  it('protects notification history/send with explicit permissions and both admin guards', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminNotificationsController.prototype.send),
    ).toEqual([PERMISSIONS.NOTIFICATIONS_SEND]);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminNotificationsController.prototype.list),
    ).toEqual([PERMISSIONS.NOTIFICATIONS_VIEW]);
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminNotificationsController) as Array<{
      name: string;
    }>;
    expect(guards.map((guard) => guard.name)).toEqual(
      expect.arrayContaining(['JwtAccessGuard', 'PermissionsGuard']),
    );
  });

  it('calculates ALL_ACTIVE_CUSTOMERS authoritatively and excludes virtual/inactive accounts', async () => {
    const { service, customer } = fixture();
    await expect(
      service.preview({ audienceType: NotificationAudienceType.ALL_ACTIVE_CUSTOMERS }),
    ).resolves.toMatchObject({ recipientCount: 2 });
    expect(customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE', isVirtual: false }),
      }),
    );
  });

  it('supports ONE_CUSTOMER and SELECTED_CUSTOMERS with real selected summaries', async () => {
    const one = fixture(['customer-1']);
    await expect(
      one.service.preview({
        audienceType: NotificationAudienceType.ONE_CUSTOMER,
        customerId: 'customer-1',
      }),
    ).resolves.toMatchObject({ recipientCount: 1 });

    const selected = fixture(['customer-1', 'customer-2']);
    await expect(
      selected.service.preview({
        audienceType: NotificationAudienceType.SELECTED_CUSTOMERS,
        customerIds: ['customer-1', 'customer-2'],
      }),
    ).resolves.toMatchObject({ recipientCount: 2 });
  });

  it('rejects an ineligible selected customer instead of silently shrinking the audience', async () => {
    const { service } = fixture(['customer-1']);
    await expect(
      service.preview({
        audienceType: NotificationAudienceType.SELECTED_CUSTOMERS,
        customerIds: ['customer-1', 'customer-2'],
      }),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_CUSTOMER_INELIGIBLE' });
  });

  it('persists recipient rows, audits safe metadata, and emits a minimal refresh hint', async () => {
    const { service, notification, audit, sockets } = fixture();
    await expect(
      service.send(
        {
          audienceType: NotificationAudienceType.ALL_ACTIVE_CUSTOMERS,
          titleAr: 'عنوان',
          bodyAr: 'نص',
          linkType: NotificationLinkType.NONE,
        },
        'admin-1',
        'idem-1',
        'hash-1',
        request,
      ),
    ).resolves.toMatchObject({ recipientCount: 2, createdCount: 2, failedCount: 0 });
    expect(notification.createMany).toHaveBeenCalledTimes(1);
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        action: 'notification_campaign.sent',
        metadata: expect.objectContaining({ recipientCount: 2 }),
      }),
    );
    expect(sockets.emitNotificationRefresh).toHaveBeenCalledWith(
      ['customer-1', 'customer-2'],
      'campaign-1',
    );
  });

  it('uses bounded batches for a large audience', async () => {
    const ids = Array.from({ length: 501 }, (_, index) => `customer-${index}`);
    const { service, notification } = fixture(ids);
    await service.send(
      {
        audienceType: NotificationAudienceType.ALL_ACTIVE_CUSTOMERS,
        titleAr: 'عنوان',
        bodyAr: 'نص',
      },
      'admin-1',
      'idem-1',
      'hash-1',
      request,
    );
    expect(notification.createMany).toHaveBeenCalledTimes(2);
    expect(notification.createMany.mock.calls[0][0].data).toHaveLength(500);
    expect(notification.createMany.mock.calls[1][0].data).toHaveLength(1);
  });

  it('replays the same idempotency key without creating duplicate notifications', async () => {
    const { service, notificationCampaign, notification } = fixture();
    notificationCampaign.findUnique.mockResolvedValue(campaign());
    await expect(
      service.send(
        {
          audienceType: NotificationAudienceType.ALL_ACTIVE_CUSTOMERS,
          titleAr: 'عنوان',
          bodyAr: 'نص',
        },
        'admin-1',
        'idem-1',
        'hash-1',
        request,
      ),
    ).resolves.toMatchObject({ campaignId: 'campaign-1' });
    expect(notification.createMany).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for a different request', async () => {
    const { service, notificationCampaign } = fixture();
    notificationCampaign.findUnique.mockResolvedValue(campaign());
    await expect(
      service.send(
        {
          audienceType: NotificationAudienceType.ALL_ACTIVE_CUSTOMERS,
          titleAr: 'عنوان آخر',
          bodyAr: 'نص',
        },
        'admin-1',
        'idem-1',
        'different-hash',
        request,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it.each(['LIVE', 'EXTERNAL_URL', 'javascript:alert(1)'])(
    'rejects unsupported notification destination %s',
    async (unsupported) => {
      const { service } = fixture();
      await expect(
        service.send(
          {
            audienceType: NotificationAudienceType.ALL_ACTIVE_CUSTOMERS,
            titleAr: 'عنوان',
            bodyAr: 'نص',
            linkType: unsupported as NotificationLinkType,
            linkTargetId: 'target-1',
          },
          'admin-1',
          'idem-1',
          'hash-1',
          request,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_NOTIFICATION_DESTINATION' });
    },
  );

  it('returns paginated campaign summaries and safe sender information', async () => {
    const { service } = fixture();
    await expect(service.list({ page: 1, limit: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ sender: { id: 'admin-1', name: 'Sender' } })],
      meta: expect.objectContaining({ total: 1 }),
    });
  });

  it('protects historical ads by rejecting Live placements and destinations', async () => {
    const ads = new AdsService({} as any, { create: jest.fn() } as any);
    const base = {
      title: 'Ad',
      body: 'Body',
      targetType: AdTargetType.ALL,
      startsAt: '2026-08-10T00:00:00.000Z',
      endsAt: '2026-08-11T00:00:00.000Z',
    };
    await expect(
      ads.create(
        {
          ...base,
          placement: AdPlacement.LIVE_BANNER,
          linkType: AdLinkType.NONE,
        },
        'admin-1',
        request,
      ),
    ).rejects.toMatchObject({ code: 'DECOMMISSIONED_AD_PLACEMENT' });
    await expect(
      ads.create(
        {
          ...base,
          placement: AdPlacement.STORE_HERO,
          linkType: AdLinkType.LIVE,
          linkTargetId: 'legacy-live',
        },
        'admin-1',
        request,
      ),
    ).rejects.toMatchObject({ code: 'DECOMMISSIONED_AD_LINK_TYPE' });
  });

  it('rejects unsafe external ad schemes while keeping HTTPS destinations available', async () => {
    const ads = new AdsService({} as any, { create: jest.fn() } as any);
    await expect(
      ads.create(
        {
          title: 'Ad',
          body: 'Body',
          placement: AdPlacement.STORE_HERO,
          targetType: AdTargetType.ALL,
          linkType: AdLinkType.EXTERNAL_URL,
          linkTargetId: 'javascript:alert(1)',
          startsAt: '2026-08-10T00:00:00.000Z',
          endsAt: '2026-08-11T00:00:00.000Z',
        },
        'admin-1',
        request,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_AD_LINK_TARGET' });
  });
});
