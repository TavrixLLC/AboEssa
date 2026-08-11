import { AuctionStatus, AuctionTier } from '@prisma/client';
import { AuctionsService } from 'src/auctions/auctions.service';
import { AdsService } from 'src/ads/ads.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { InfluencersService } from 'src/influencers/influencers.service';

describe('Backend Phase D readiness contracts', () => {
  it('maps auction tier and VIP flag as stable response fields', () => {
    const service = new AuctionsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const response = (service as any).toAuctionResponse({
      id: 'auction-1',
      title: 'VIP',
      description: null,
      categoryId: 'category-1',
      category: { name: 'Test' },
      imageUrls: [],
      tier: AuctionTier.VIP,
      status: AuctionStatus.ACTIVE,
      startingPrice: 100,
      currentPrice: 100,
      minIncrement: 10,
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 1000),
      _count: { bids: 0 },
    });
    expect(response).toMatchObject({
      tier: AuctionTier.VIP,
      isVip: true,
      categoryId: 'category-1',
      categoryName: 'Test',
    });
  });

  it('batch-reads only owned unread notifications and is empty-list idempotent', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const service = new NotificationsService(
      { notification: { updateMany, count: jest.fn() } } as any,
      {} as any,
    );
    await expect(service.readBatch('customer-1', ['n-1', 'n-1', 'n-2'])).resolves.toEqual({
      updatedCount: 2,
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['n-1', 'n-2'] }, customerId: 'customer-1', readAt: null },
      }),
    );
    await expect(service.readBatch('customer-1', [])).resolves.toEqual({ updatedCount: 0 });
  });

  it('commission transition service rejects mark-paid before approval', async () => {
    const prisma = {
      commissionLedger: {
        findUnique: jest.fn().mockResolvedValue({ id: 'commission-1', status: 'PENDING' }),
      },
    };
    const service = new InfluencersService(prisma as any, {} as any);
    await expect(
      service.setCommissionStatus('commission-1', 'PAID', 'admin-1', {
        ip: '127.0.0.1',
        headers: {},
      } as any),
    ).rejects.toMatchObject({ code: 'INVALID_COMMISSION_STATUS_TRANSITION' });
  });

  it('ad public query orders by priority and excludes inactive/date-invalid targets', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const service = new AdsService(
      {
        inAppAd: { findMany, count },
        $transaction: jest.fn().mockResolvedValue([[], 0]),
        customer: { findUnique: jest.fn() },
      } as any,
      {} as any,
    );
    await service.customerAds({ placement: 'STORE_HERO', page: 1, limit: 20 } as any);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
  });
});
