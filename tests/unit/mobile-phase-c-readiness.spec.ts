/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  ActorType,
  AuctionStatus,
  BidStatus,
  CheckoutPaymentMethod,
  CustomerStatus,
  LabelStatus,
  NotificationType,
  Prisma,
  ProductListingStatus,
  SaleSource,
  VerificationStatus,
} from '@prisma/client';
import { IdempotencyService } from 'src/common/idempotency/idempotency.service';
import { PERMISSIONS_CATALOG } from 'src/permissions/permissions.catalog';
import { ProductsService } from 'src/products/products.service';
import { AuctionsService } from 'src/auctions/auctions.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { TimeController } from 'src/time/time.controller';
import { UploadsService } from 'src/uploads/uploads.service';
import { SocketsService } from 'src/sockets/sockets.service';
import { MarketplaceService } from 'src/marketplace/marketplace.service';

const request = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as any;
const auditLogs = () => ({ create: jest.fn().mockResolvedValue({}) });
const checkoutDto = {
  paymentMethod: CheckoutPaymentMethod.WALLET,
  delivery: {
    fullName: 'Test Customer',
    phone: '07738006852',
    governorate: 'Baghdad',
    city: 'Baghdad',
    addressLine: 'Test address',
  },
};

function category() {
  return { id: 'cat-1', name: 'Electronics', isActive: true };
}

function product(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-07-13T12:00:00.000Z');
  return {
    id: 'product-1',
    title: 'Phone',
    description: 'Mobile phone',
    categoryId: 'cat-1',
    category: category(),
    imageUrls: ['https://example.com/product.jpg'],
    price: new Prisma.Decimal(15000),
    totalQuantity: 3,
    availableQuantity: 3,
    soldQuantity: 0,
    status: ProductListingStatus.ACTIVE,
    soldToCustomerId: null,
    soldToCustomer: null,
    soldOrderItemId: null,
    soldOrderItem: null,
    publishedAt: now,
    soldAt: null,
    createdByAdminId: 'admin-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function auction(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 'auction-1',
    title: 'Auction item',
    description: 'Auction description',
    categoryId: 'cat-1',
    category: category(),
    imageUrls: ['https://example.com/auction.jpg'],
    startingPrice: new Prisma.Decimal(1000),
    currentPrice: new Prisma.Decimal(1500),
    minIncrement: new Prisma.Decimal(500),
    status: AuctionStatus.ACTIVE,
    startsAt: new Date(now - 60_000),
    endsAt: new Date(now + 60_000),
    originalEndsAt: new Date(now + 60_000),
    extensionSeconds: 30,
    extensionTriggerSeconds: 20,
    maxExtensions: 3,
    extensionsCount: 0,
    winnerCustomerId: null,
    winningBidId: 'bid-1',
    winningBid: { id: 'bid-1', customerId: 'customer-1', amount: new Prisma.Decimal(1500) },
    winnerCustomer: null,
    soldOrderItemId: null,
    createdByAdminId: 'admin-1',
    createdAt: new Date(now - 120_000),
    updatedAt: new Date(now - 120_000),
    _count: { bids: 1 },
    bids: [
      {
        id: 'bid-1',
        customerId: 'customer-1',
        amount: new Prisma.Decimal(1500),
        status: BidStatus.WINNING,
        placedAt: new Date(),
        createdAt: new Date(),
      },
    ],
    ...overrides,
  };
}

describe('Backend Mobile Phase C readiness contracts', () => {
  it('permissions catalog exposes grouped product and auction permissions', () => {
    const groups = new Map(PERMISSIONS_CATALOG.map((group) => [group.group, group]));

    expect(groups.get('products')?.permissions.map((permission) => permission.key)).toEqual(
      expect.arrayContaining([
        'products.view',
        'products.create',
        'products.publish',
        'products.upload_images',
      ]),
    );
    expect(groups.get('auctions')?.permissions.map((permission) => permission.key)).toEqual(
      expect.arrayContaining(['auctions.view', 'auctions.close_now', 'auctions.view_bids']),
    );
    expect(groups.has('customers')).toBe(true);
    expect(groups.has('commissions')).toBe(true);
  });

  it('GET /api/time controller returns ISO server time', () => {
    const result = new TimeController().now();

    expect(result.serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isNaN(Date.parse(result.serverTime))).toBe(false);
  });

  it('idempotency requires a key and reports stable conflict code', async () => {
    const service = new IdempotencyService(
      {
        idempotencyKey: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ requestHash: 'old-hash', responseJson: { ok: true } }),
        },
      } as any,
      { get: jest.fn().mockReturnValue(86400) } as any,
    );

    expect(() => service.requireKey({})).toThrow(
      expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REQUIRED' }),
    );
    await expect(
      service.getReplayOrThrowConflict({
        key: 'idem-1',
        actorType: ActorType.CUSTOMER,
        actorId: 'customer-1',
        endpoint: 'POST:/api/products/product-1/buy',
        requestHash: 'new-hash',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
});

describe('ProductsService mobile contract', () => {
  function makeService(
    options: {
      productStatus?: ProductListingStatus;
      claimCount?: number;
      transactionError?: unknown;
    } = {},
  ) {
    const sale = {
      customer: { id: 'customer-1' },
      order: { id: 'order-1' },
      items: [
        {
          id: 'item-1',
          orderId: 'order-1',
          customerId: 'customer-1',
          price: new Prisma.Decimal(15000),
          labelStatus: LabelStatus.PENDING,
          soldAt: new Date('2026-07-13T12:00:00.000Z'),
        },
        {
          id: 'item-2',
          orderId: 'order-1',
          customerId: 'customer-1',
          price: new Prisma.Decimal(15000),
          labelStatus: LabelStatus.PENDING,
          soldAt: new Date('2026-07-13T12:00:00.000Z'),
        },
      ],
      labelPrintJobs: [],
      labelPayloads: [],
    };
    const tx = {
      productListing: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            product({ status: options.productStatus ?? ProductListingStatus.ACTIVE }),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: options.claimCount ?? 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      category: {
        findUnique: jest.fn().mockResolvedValue(category()),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => {
        if (options.transactionError) {
          throw options.transactionError;
        }
        return callback(tx);
      }),
      productListing: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve(
            product({
              ...data,
              price: new Prisma.Decimal(data.price),
              category: category(),
            }),
          ),
        ),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve(
            product({
              ...data,
              imageUrls: data.imageUrls ?? product().imageUrls,
              category: category(),
            }),
          ),
        ),
        findUniqueOrThrow: jest.fn().mockResolvedValue(
          product({
            status: ProductListingStatus.SOLD,
            totalQuantity: 3,
            availableQuantity: 1,
            soldQuantity: 2,
            soldToCustomerId: 'customer-1',
            soldAt: new Date('2026-07-13T12:00:00.000Z'),
          }),
        ),
      },
      category: {
        findUnique: jest.fn().mockResolvedValue(category()),
      },
    };
    const sales = {
      createSoldItemInTransaction: jest
        .fn()
        .mockImplementation((_tx, input) =>
          Promise.resolve({ ...sale, items: sale.items.slice(0, input.quantity ?? 1) }),
        ),
      recordSoldItemSideEffects: jest.fn().mockResolvedValue({}),
      toPublicSaleResult: jest.fn().mockImplementation((result) => result),
    };
    const sockets = { emitToAdmins: jest.fn(), emitToCustomers: jest.fn() };
    const notifications = { createForCustomer: jest.fn().mockResolvedValue({}) };
    const checkout = {
      complete: jest.fn().mockImplementation((_tx, input) =>
        Promise.resolve({
          walletPaid: input.totalAmount,
          cashDue: new Prisma.Decimal(0),
          shipmentRequest: { id: 'shipment-1' },
        }),
      ),
    };
    const service = new ProductsService(
      prisma as any,
      sales as any,
      auditLogs() as any,
      sockets as any,
      notifications as any,
      checkout as any,
    );
    return { service, sockets, prisma, checkout };
  }

  it('maps products to stable mobile-safe fields', () => {
    const { service } = makeService();
    const response = service.toProductResponse(product() as any, true);

    expect(response).toMatchObject({
      id: 'product-1',
      categoryName: 'Electronics',
      price: '15000.00',
      isAvailable: true,
      availableQuantity: 3,
      soldQuantity: 0,
      totalQuantity: 3,
      orderItemId: null,
    });
  });

  it('product creation defaults quantity to one', async () => {
    const { service } = makeService();

    const result = await service.create(
      {
        title: 'One unit',
        categoryId: 'cat-1',
        price: 5000,
      },
      'admin-1',
      request,
    );

    expect(result).toMatchObject({
      totalQuantity: 1,
      availableQuantity: 1,
      soldQuantity: 0,
    });
  });

  it('product creation accepts quantity greater than one', async () => {
    const { service } = makeService();

    const result = await service.create(
      {
        title: 'Three units',
        categoryId: 'cat-1',
        price: 5000,
        quantity: 3,
      },
      'admin-1',
      request,
    );

    expect(result).toMatchObject({
      totalQuantity: 3,
      availableQuantity: 3,
      soldQuantity: 0,
    });
  });

  it('product creation persists the canonical media reference', async () => {
    const { service, prisma } = makeService();
    const imageUrl = '/api/media/products/product.jpg';

    const result = await service.create(
      {
        title: 'Product with image',
        categoryId: 'cat-1',
        price: 5000,
        imageUrls: [imageUrl],
      },
      'admin-1',
      request,
    );

    expect(result.imageUrls).toEqual([imageUrl]);
    expect(prisma.productListing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrls: [imageUrl] }),
      }),
    );
  });

  it('product update persists a replacement media reference', async () => {
    const { service, prisma } = makeService();
    const imageUrl = '/api/media/products/replacement.webp';
    prisma.productListing.update.mockImplementation(({ data }) =>
      Promise.resolve(
        product({
          imageUrls: data.imageUrls ?? product().imageUrls,
          category: category(),
        }),
      ),
    );

    const result = await service.update('product-1', { imageUrls: [imageUrl] }, 'admin-1', request);

    expect(result.imageUrls).toEqual([imageUrl]);
    expect(prisma.productListing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrls: [imageUrl] }),
      }),
    );
  });

  it('product quantity zero is rejected with stable code', async () => {
    const { service } = makeService();

    await expect(
      service.create(
        {
          title: 'Invalid units',
          categoryId: 'cat-1',
          price: 5000,
          quantity: 0,
        },
        'admin-1',
        request,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_PRODUCT_QUANTITY',
    });
  });

  it('product creation rejects inactive categories', async () => {
    const { service } = makeService();
    const prisma = (service as any).prisma;
    prisma.category.findUnique.mockResolvedValue({ ...category(), isActive: false });

    await expect(
      service.create(
        {
          title: 'Inactive category product',
          categoryId: 'cat-1',
          price: 5000,
        },
        'admin-1',
        request,
      ),
    ).rejects.toMatchObject({
      code: 'CATEGORY_INACTIVE',
    });
  });

  it('buy product returns stable purchase result and emits realtime update', async () => {
    const { service, sockets } = makeService();

    const result = await service.buy('product-1', 'customer-1', request, checkoutDto);

    expect(result).toMatchObject({
      productId: 'product-1',
      orderItemId: 'item-1',
      orderId: 'order-1',
      customerId: 'customer-1',
      price: '15000.00',
      requestedQuantity: 1,
      purchasedQuantity: 1,
      remainingQuantity: 2,
      status: 'AWAITING_FULFILLMENT',
    });
    expect(sockets.emitToAdmins).toHaveBeenCalledWith(
      'product_sold',
      expect.objectContaining({ productId: 'product-1' }),
    );
    expect(sockets.emitToCustomers).toHaveBeenCalledWith(
      'product_sold',
      expect.objectContaining({ productId: 'product-1' }),
    );
  });

  it('quantity buy decrements stock and returns all physical order items', async () => {
    const { service, checkout } = makeService();

    const result = await service.buy('product-1', 'customer-1', request, {
      ...checkoutDto,
      quantity: 2,
    });

    expect(result).toMatchObject({
      requestedQuantity: 2,
      purchasedQuantity: 2,
      remainingQuantity: 1,
      unitPrice: '15000.00',
      totalPrice: '30000.00',
    });
    expect(result.orderItems).toHaveLength(2);
    expect(checkout.complete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        totalAmount: new Prisma.Decimal('30000'),
        paymentMethod: CheckoutPaymentMethod.WALLET,
      }),
    );
  });

  it('insufficient product stock returns stable quantity conflict', async () => {
    const { service } = makeService();

    await expect(
      service.buy('product-1', 'customer-1', request, { ...checkoutDto, quantity: 4 }),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_PRODUCT_STOCK',
    });
  });

  it('quantity claim failure prevents oversell', async () => {
    const { service } = makeService({ claimCount: 0 });

    await expect(
      service.buy('product-1', 'customer-1', request, { ...checkoutDto, quantity: 2 }),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_PRODUCT_STOCK',
    });
  });

  it('serializable transaction conflicts request a retry without falsely reporting stock', async () => {
    const { service } = makeService({
      transactionError: new Prisma.PrismaClientKnownRequestError(
        'Serializable transaction failed',
        {
          code: 'P2034',
          clientVersion: 'test',
        },
      ),
    });

    await expect(
      service.buy('product-1', 'customer-1', request, checkoutDto),
    ).rejects.toMatchObject({
      code: 'PURCHASE_CONFLICT_RETRY',
    });
  });

  it('admin product update cannot lower quantity below sold count', async () => {
    const { service } = makeService();
    const prisma = (service as any).prisma;
    prisma.productListing.findUniqueOrThrow.mockResolvedValue(
      product({ totalQuantity: 3, availableQuantity: 1, soldQuantity: 2 }),
    );

    await expect(
      service.update('product-1', { quantity: 1 }, 'admin-1', request),
    ).rejects.toMatchObject({
      code: 'PRODUCT_QUANTITY_BELOW_SOLD',
    });
  });

  it('already sold product returns PRODUCT_ALREADY_SOLD', async () => {
    const { service } = makeService({ productStatus: ProductListingStatus.SOLD });

    await expect(
      service.buy('product-1', 'customer-1', request, checkoutDto),
    ).rejects.toMatchObject({
      code: 'PRODUCT_ALREADY_SOLD',
    });
  });
});

describe('AuctionsService mobile contract', () => {
  function makeService(auctionOverride: Record<string, unknown> = {}) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'auction-1' }]),
      appSettings: {
        upsert: jest.fn().mockResolvedValue({
          allowUnverifiedBidding: true,
          unverifiedBidLimit: new Prisma.Decimal(100000),
        }),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'customer-1',
          status: CustomerStatus.ACTIVE,
          verificationStatus: VerificationStatus.VERIFIED,
          purchaseLimitOverride: null,
        }),
      },
      auction: {
        findUnique: jest
          .fn()
          .mockResolvedValue(auction({ winningBid: null, winningBidId: null, ...auctionOverride })),
        update: jest
          .fn()
          .mockResolvedValue(
            auction({ currentPrice: new Prisma.Decimal(2000), ...auctionOverride }),
          ),
      },
      category: {
        findUnique: jest.fn().mockResolvedValue(category()),
      },
      bid: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({
          id: 'bid-2',
          auctionId: 'auction-1',
          customerId: 'customer-1',
          amount: new Prisma.Decimal(2000),
          status: BidStatus.WINNING,
          placedAt: new Date(),
          createdAt: new Date(),
        }),
      },
      orderItem: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((input) => (Array.isArray(input) ? Promise.all(input) : input(tx))),
      appSettings: {
        upsert: jest.fn().mockResolvedValue({
          defaultAuctionExtensionSeconds: 30,
          defaultAuctionExtensionTriggerSeconds: 20,
          maxAuctionExtensions: 3,
        }),
      },
      auction: {
        create: jest.fn().mockResolvedValue(auction({ status: AuctionStatus.DRAFT })),
        findMany: jest.fn().mockResolvedValue([auction()]),
        count: jest.fn().mockResolvedValue(1),
        findFirstOrThrow: jest.fn().mockResolvedValue(auction()),
        findUnique: jest.fn().mockResolvedValue(auction()),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue(auction({ currentPrice: new Prisma.Decimal(2000) })),
        update: jest.fn().mockResolvedValue({}),
      },
      category: {
        findUnique: jest.fn().mockResolvedValue(category()),
      },
    };
    const notifications = { createForCustomer: jest.fn().mockResolvedValue({}) };
    const sockets = { emitToAdmins: jest.fn(), emitToCustomers: jest.fn() };
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const sales = {
      createSoldItemInTransaction: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'item-auction-1',
            orderId: 'order-auction-1',
            customerId: 'customer-1',
            price: new Prisma.Decimal('1500'),
          },
        ],
      }),
      recordSoldItemSideEffects: jest.fn().mockResolvedValue(undefined),
    };
    const wallet = {
      reserveBid: jest.fn().mockResolvedValue(undefined),
      releaseBid: jest.fn().mockResolvedValue(undefined),
      settleBid: jest.fn().mockResolvedValue(undefined),
    };
    const checkout = {
      depositFor: (amount: Prisma.Decimal) => amount.mul('0.10'),
      complete: jest.fn().mockResolvedValue({
        shipmentRequest: { id: 'shipment-request-1' },
        walletPaid: new Prisma.Decimal('1500'),
        cashDue: new Prisma.Decimal(0),
      }),
    };
    const service = new AuctionsService(
      prisma as any,
      sales as any,
      auditLogs() as any,
      sockets as any,
      notifications as any,
      queue as any,
      wallet as any,
      checkout as any,
    );
    return { service, prisma, sockets, tx, wallet, sales, checkout };
  }

  it('auction list includes serverTime and minimumNextBid', async () => {
    const { service } = makeService();

    const result = await service.findAll({ page: 1, limit: 20 }, true, 'customer-1');

    expect(result.serverTime).toMatch(/^\d{4}-/);
    expect(result.items[0]).toMatchObject({
      id: 'auction-1',
      currentPrice: '1500.00',
      minimumNextBid: '2000.00',
      bidDepositPercent: 10,
      myHighestBid: '1500.00',
      isWinning: true,
    });
  });

  it('auction creation rejects inactive categories', async () => {
    const { service, prisma } = makeService();
    prisma.category.findUnique.mockResolvedValue({ ...category(), isActive: false });

    await expect(
      service.create(
        {
          title: 'Inactive category auction',
          categoryId: 'cat-1',
          startingPrice: 1000,
          minIncrement: 500,
          startsAt: new Date(Date.now() + 1000).toISOString(),
          endsAt: new Date(Date.now() + 60_000).toISOString(),
        },
        'admin-1',
        request,
      ),
    ).rejects.toMatchObject({
      code: 'CATEGORY_INACTIVE',
    });
  });

  it('bid success returns stable bid result and emits auction update', async () => {
    const { service, sockets, wallet } = makeService();

    const result = await service.placeBid('auction-1', 'customer-1', { amount: 2000 }, request);

    expect(result).toMatchObject({
      auctionId: 'auction-1',
      bidId: 'bid-2',
      amount: '2000.00',
      currentPrice: '2000.00',
      minimumNextBid: '2500.00',
      isWinning: true,
    });
    expect(wallet.reserveBid).toHaveBeenCalledWith(
      expect.anything(),
      'customer-1',
      new Prisma.Decimal('200'),
      'bid-2',
      undefined,
    );
    expect(sockets.emitToAdmins).toHaveBeenCalledWith(
      'auction_updated',
      expect.objectContaining({ id: 'auction-1' }),
    );
    expect(sockets.emitToCustomers).toHaveBeenCalledWith(
      'auction_updated',
      expect.objectContaining({ id: 'auction-1' }),
    );
  });

  it('returns the previous winning wallet hold before reserving a higher bid', async () => {
    const { service, wallet } = makeService({
      winningBid: {
        id: 'bid-1',
        customerId: 'customer-2',
        amount: new Prisma.Decimal('1500'),
        walletReserved: true,
      },
    });
    await service.placeBid('auction-1', 'customer-1', { amount: 2000 }, request);
    expect(wallet.releaseBid).toHaveBeenCalledWith(
      expect.anything(),
      'customer-2',
      new Prisma.Decimal('1500'),
      'bid-1',
    );
    expect(wallet.releaseBid.mock.invocationCallOrder[0]).toBeLessThan(
      wallet.reserveBid.mock.invocationCallOrder[0],
    );
  });

  it('cancelling an auction returns only its active wallet hold', async () => {
    const { service, wallet, tx } = makeService({
      winningBid: {
        id: 'bid-1',
        customerId: 'customer-1',
        amount: new Prisma.Decimal('1500'),
        walletReserved: true,
      },
    });
    await service.cancel('auction-1', 'admin-1', request);
    expect(wallet.releaseBid).toHaveBeenCalledWith(
      expect.anything(),
      'customer-1',
      new Prisma.Decimal('1500'),
      'bid-1',
    );
    expect(tx.bid.update).toHaveBeenCalledWith({
      where: { id: 'bid-1' },
      data: { status: BidStatus.CANCELLED, walletReserved: false },
    });
  });

  it('cancelling a legacy bid marks it cancelled without inventing a wallet refund', async () => {
    const { service, wallet, tx } = makeService({
      winningBid: {
        id: 'bid-legacy',
        customerId: 'customer-1',
        amount: new Prisma.Decimal('1500'),
        walletReserved: false,
      },
    });
    await service.cancel('auction-1', 'admin-1', request);
    expect(wallet.releaseBid).not.toHaveBeenCalled();
    expect(tx.bid.update).toHaveBeenCalledWith({
      where: { id: 'bid-legacy' },
      data: { status: BidStatus.CANCELLED, walletReserved: false },
    });
  });

  it('a cancelled auction does not report its refunded bidder as winning or outbid', () => {
    const { service } = makeService();
    const response = (service as any).toAuctionResponse(
      auction({ status: AuctionStatus.CANCELLED }) as any,
      { customerId: 'customer-1' },
    );
    expect(response.isWinning).toBe(false);
    expect(response.isOutbid).toBe(false);
  });

  it('keeps the winning deposit reserved and does not create an order until checkout', async () => {
    const { service, wallet, sales, tx } = makeService({
      endsAt: new Date(Date.now() - 1000),
      winningBid: {
        id: 'bid-1',
        customerId: 'customer-1',
        amount: new Prisma.Decimal('1500'),
        walletReserved: true,
      },
    });
    await service.closeAuction('auction-1');
    expect(wallet.settleBid).not.toHaveBeenCalled();
    expect(sales.createSoldItemInTransaction).not.toHaveBeenCalled();
    expect(tx.orderItem.update).not.toHaveBeenCalled();
    expect(tx.auction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: AuctionStatus.ENDED,
          winnerCustomerId: 'customer-1',
        },
      }),
    );
  });

  it('reports checkout required for a winner before any order exists', () => {
    const { service } = makeService();
    const response = (service as any).toAuctionResponse(
      auction({
        status: AuctionStatus.ENDED,
        winnerCustomerId: 'customer-1',
        soldOrderItemId: null,
        soldOrderItem: null,
      }) as any,
      { customerId: 'customer-1' },
    );

    expect(response.checkoutRequired).toBe(true);
  });

  it('creates the auction order only when the winner confirms checkout', async () => {
    const { service, sales, checkout, tx } = makeService({
      status: AuctionStatus.ENDED,
      endsAt: new Date(Date.now() - 1000),
      winnerCustomerId: 'customer-1',
      soldOrderItemId: null,
      soldOrderItem: null,
      winningBid: {
        id: 'bid-1',
        customerId: 'customer-1',
        amount: new Prisma.Decimal('1500'),
        reservedAmount: new Prisma.Decimal('150'),
        walletReserved: true,
      },
    });

    const result = await service.checkoutWonAuction(
      'auction-1',
      'customer-1',
      checkoutDto,
      request,
    );

    expect(sales.createSoldItemInTransaction).toHaveBeenCalledTimes(1);
    expect(tx.auction.update).toHaveBeenCalledWith({
      where: { id: 'auction-1' },
      data: { soldOrderItemId: 'item-auction-1' },
    });
    expect(checkout.complete).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        orderId: 'order-auction-1',
        itemIds: ['item-auction-1'],
        bidHold: { bidId: 'bid-1', amount: new Prisma.Decimal('150') },
      }),
    );
    expect(sales.recordSoldItemSideEffects).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      auctionId: 'auction-1',
      orderId: 'order-auction-1',
      orderItemId: 'item-auction-1',
      status: 'AWAITING_FULFILLMENT',
    });
  });

  it('allows an active unverified customer to bid despite legacy verification limits', async () => {
    const { service, tx } = makeService();
    tx.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      status: CustomerStatus.ACTIVE,
      verificationStatus: VerificationStatus.UNVERIFIED,
      purchaseLimitOverride: null,
    });
    tx.appSettings.upsert.mockResolvedValue({
      allowUnverifiedBidding: false,
      unverifiedBidLimit: new Prisma.Decimal(0),
    });

    const result = await service.placeBid('auction-1', 'customer-1', { amount: 2000 }, request);
    expect(result.bidId).toBe('bid-2');
  });

  it('continues to reject blocked customers from bidding', async () => {
    const { service, tx } = makeService();
    tx.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      status: CustomerStatus.BLOCKED,
      verificationStatus: VerificationStatus.UNVERIFIED,
    });

    await expect(
      service.placeBid('auction-1', 'customer-1', { amount: 2000 }, request),
    ).rejects.toMatchObject({ code: 'CUSTOMER_NOT_ALLOWED_TO_BID' });
  });

  it('bid too low and ended auctions return stable codes', async () => {
    const low = makeService();
    await expect(
      low.service.placeBid('auction-1', 'customer-1', { amount: 1000 }, request),
    ).rejects.toMatchObject({
      code: 'BID_TOO_LOW',
    });

    const ended = makeService({ endsAt: new Date(Date.now() - 1000) });
    await expect(
      ended.service.placeBid('auction-1', 'customer-1', { amount: 2000 }, request),
    ).rejects.toMatchObject({
      code: 'AUCTION_ENDED',
    });
  });

  it('authenticated bidder can refetch ended auction detail after close', async () => {
    const { service, prisma } = makeService();
    prisma.auction.findFirstOrThrow.mockResolvedValue(
      auction({
        status: AuctionStatus.ENDED,
        endsAt: new Date(Date.now() - 1000),
        winnerCustomerId: 'customer-1',
        winningBid: { id: 'bid-1', customerId: 'customer-1', amount: new Prisma.Decimal(1500) },
      }),
    );

    const result = await service.findOne('auction-1', true, 'customer-1');

    expect(prisma.auction.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'auction-1',
          OR: expect.arrayContaining([
            { status: AuctionStatus.ACTIVE },
            { bids: { some: { customerId: 'customer-1' } } },
            { winnerCustomerId: 'customer-1' },
          ]),
        }),
      }),
    );
    expect(result).toMatchObject({
      id: 'auction-1',
      status: AuctionStatus.ENDED,
      isEnded: true,
      canBid: false,
      isWinning: true,
    });
  });

  it('close now delegates to closeAuction', async () => {
    const { service } = makeService();
    jest.spyOn(service, 'closeAuction').mockResolvedValue({ auction: null, sale: null });

    await expect(service.closeNow('auction-1', 'admin-1')).resolves.toEqual({
      auction: null,
      sale: null,
    });
  });
});

describe('MarketplaceService mobile contract', () => {
  it('combines live auctions first and available products only', async () => {
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([[product()], 1, [auction()], 1]),
      productListing: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      auction: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    const service = new MarketplaceService(prisma as any);

    const result = await service.findAll({ page: 1, limit: 20, categoryId: 'cat-1' }, 'customer-1');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.productListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: 'cat-1' }) }),
    );
    expect(prisma.auction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: 'cat-1' }) }),
    );
    expect(result.items.map((item) => item.itemType)).toEqual(['AUCTION', 'PRODUCT']);
    expect(result.meta).toMatchObject({ page: 1, limit: 20, total: 2 });
    expect(result.items[0]).toMatchObject({
      id: 'auction-1',
      displayPrice: '1500.00',
      minimumNextBid: '2000.00',
      isWinning: true,
    });
    expect(result.items[1]).toMatchObject({
      id: 'product-1',
      displayPrice: '15000.00',
      availableQuantity: 3,
      isAvailable: true,
    });
  });
});

describe('Notifications, uploads, and realtime contracts', () => {
  it('notification list maps read state and metadata', async () => {
    const notification = {
      id: 'notification-1',
      customerId: 'customer-1',
      type: NotificationType.ORDER_UPDATED,
      title: 'Order updated',
      body: 'Item changed',
      data: { linkType: 'product', linkTargetId: 'product-1', productId: 'product-1' },
      readAt: null,
      pushSentAt: null,
      createdAt: new Date('2026-07-13T12:00:00.000Z'),
    };
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([[notification], 1]),
      notification: {
        findMany: jest.fn().mockResolvedValue([notification]),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue({ ...notification, readAt: new Date() }),
      },
      customerNotificationSettings: {
        upsert: jest.fn().mockResolvedValue({ customerId: 'customer-1', auctionOutbid: true }),
      },
    };
    const service = new NotificationsService(prisma as any, {} as any);

    const list = await service.listCustomer('customer-1', { page: 1, limit: 20 });
    const read = await service.markRead('customer-1', 'notification-1');

    expect(list.items[0]).toMatchObject({
      id: 'notification-1',
      isRead: false,
      linkType: 'product',
      linkTargetId: 'product-1',
    });
    expect(read).toEqual({ id: 'notification-1', read: true });
  });

  it('uploads validate auth-side image constraints and persist file asset', async () => {
    const prisma = {
      fileAsset: {
        create: jest.fn().mockImplementation(({ data, select }) =>
          Promise.resolve({
            url: data.url,
            key: data.key,
            mimeType: data.mimeType,
            size: data.size,
          }),
        ),
      },
    };
    const storage = {
      putObject: jest.fn().mockImplementation((input) =>
        Promise.resolve({
          key: input.key,
          url: `/api/media/${input.key}`,
          mimeType: input.mimeType,
          size: input.size,
        }),
      ),
      getObject: jest.fn(),
      removeObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = new UploadsService(
      {
        get: jest.fn((key: string) => {
          const values: Record<string, unknown> = {
            'upload.maxBytes': 100,
            'upload.allowedMime': ['image/png'],
          };
          return values[key];
        }),
      } as any,
      prisma as any,
      storage,
    );
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

    const result = await service.uploadImage(
      { originalname: 'test.png', mimetype: 'image/png', size: png.length, buffer: png },
      { folder: 'products' },
      'admin-1',
    );

    expect(result).toMatchObject({ mimeType: 'image/png', size: png.length });
    expect(result.url).toMatch(/^\/api\/media\/products\/.+\.png$/);
    expect(result.url).not.toContain('localhost');
    expect(result.key).toMatch(/^products\/.+\.png$/);
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png', size: png.length }),
    );
    await expect(
      service.uploadImage(
        { originalname: 'test.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('test') },
        { folder: 'products' },
        'admin-1',
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE_TYPE' });
  });

  it('sockets service emits to expected rooms', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const service = new SocketsService();
    service.bindServer({ to } as any);

    service.emitToCustomers('auction_updated', { auctionId: 'auction-1' });
    service.emitToCustomer('customer-1', 'notification', { id: 'notification-1' });

    expect(to).toHaveBeenCalledWith('customers');
    expect(to).toHaveBeenCalledWith('customer:customer-1');
    expect(emit).toHaveBeenCalledWith('auction_updated', { auctionId: 'auction-1' });
    expect(emit).toHaveBeenCalledWith('notification', { id: 'notification-1' });
  });
});
