/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import {
  ActorType,
  CustomerStatus,
  LabelStatus,
  LiveSessionSource,
  LiveSessionStatus,
  OrderStatus,
  Prisma,
  PrintJobStatus,
  SaleSource,
  VerificationStatus,
} from '@prisma/client';
import { LabelsService } from 'src/labels/labels.service';
import { SalesService } from 'src/sales/sales.service';
import { SalesSessionsService } from 'src/sales-sessions/sales-sessions.service';
import { WarehouseService } from 'src/warehouse/warehouse.service';

const auditLogs = () => ({ create: jest.fn().mockResolvedValue({}) });
const sockets = () => ({
  emitSale: jest.fn(),
  emitLabelJobUpdated: jest.fn(),
  emitSessionUpdated: jest.fn(),
  emitSessionEnded: jest.fn(),
});

const request = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as any;

describe('SalesService', () => {
  function makeSalesHarness(options: { blocked?: boolean; limit?: number; verified?: boolean } = {}) {
    let barcodeIndex = 0;
    const order = {
      id: 'order-1',
      customerId: 'customer-1',
      status: OrderStatus.OPEN,
      totalAmount: new Prisma.Decimal(0),
      itemsCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      shippingRequestedAt: null,
      shippedAt: null,
      deliveredAt: null,
      cancelledAt: null,
      notes: null,
    };
    const customer = {
      id: 'customer-1',
      displayName: 'Ahmed',
      phone: '+9647700000000',
      whatsappPhone: '+9647700000000',
      tiktokUsername: null,
      status: options.blocked ? CustomerStatus.BLOCKED : CustomerStatus.ACTIVE,
      verificationStatus: options.verified ? VerificationStatus.VERIFIED : VerificationStatus.UNVERIFIED,
      isVirtual: false,
      purchaseLimitOverride: null,
      totalPurchasedAmount: new Prisma.Decimal(0),
      totalCancelledAmount: new Prisma.Decimal(0),
      trustLevel: null,
      notes: null,
      referralCodeUsed: null,
      referredByInfluencerId: null,
      referralExpiresAt: null,
      refreshTokenHash: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      referralAttribution: null,
    };
    const items: any[] = [];
    const tx = {
      appSettings: {
        upsert: jest.fn().mockResolvedValue({
          id: 'app_settings_singleton',
          storeName: 'Abo Essa Store',
          currency: 'IQD',
          allowUnverifiedPurchase: true,
          unverifiedPurchaseLimit: new Prisma.Decimal(options.limit ?? 100000),
          labelTemplate: {},
        }),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue(customer),
        findUniqueOrThrow: jest.fn().mockResolvedValue(customer),
        update: jest.fn().mockResolvedValue(customer),
      },
      category: { findUnique: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Clothes' }) },
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: LiveSessionStatus.ACTIVE,
          totalAmount: new Prisma.Decimal(4000),
          numberOfSales: 1,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      order: {
        findFirst: jest.fn().mockResolvedValue(order),
        create: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockImplementation(({ data }) => {
          order.itemsCount += data.itemsCount.increment;
          order.totalAmount = order.totalAmount.plus(data.totalAmount.increment);
          return Promise.resolve(order);
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(order),
      },
      customerBox: { upsert: jest.fn().mockResolvedValue({}) },
      orderItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => {
          const item = {
            ...data,
            id: `item-${items.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            cancelledAt: null,
            labelPrintedAt: null,
            labelAttachedAt: null,
          };
          items.push(item);
          return Promise.resolve(item);
        }),
      },
      commissionLedger: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
      customer: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    const labels = {
      generateBarcode: jest.fn().mockImplementation(() => {
        barcodeIndex += 1;
        return Promise.resolve(`ITEM-20260713-A8K2M${barcodeIndex}`);
      }),
      createPrintJob: jest.fn().mockImplementation((itemId: string) =>
        Promise.resolve({
          id: `job-${itemId}`,
          orderItemId: itemId,
          customerId: 'customer-1',
          barcode: `BAR-${itemId}`,
          template: {},
          status: PrintJobStatus.PENDING,
          printerName: null,
          printedByAdminId: null,
          printedAt: null,
          confirmedByAdminId: null,
          confirmedAt: null,
          error: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      createLabelPayload: jest.fn().mockImplementation((itemId: string) =>
        Promise.resolve({
          storeName: 'Abo Essa Store',
          customerName: 'Ahmed',
          customerCode: 'CUST-000001',
          itemBarcode: items.find((item) => item.id === itemId)?.barcode ?? 'ITEM',
          price: 4000,
          currency: 'IQD',
          source: SaleSource.TIKTOK_LIVE_MANUAL,
          soldAt: new Date().toISOString(),
          flags: { isBroken: false, isGift: false, isReplacement: false },
          labelStatus: LabelStatus.PENDING,
          qrValue: 'ITEM',
          barcodeValue: 'ITEM',
        }),
      ),
    };

    const service = new SalesService(prisma as any, labels as any, auditLogs() as any, sockets() as any);
    return { service, tx, labels };
  }

  it('creates one sold item, updates totals, and creates a print job when requested', async () => {
    const { service, tx, labels } = makeSalesHarness();

    const result = await service.createSoldItem(
      {
        customerId: 'customer-1',
        categoryId: 'cat-1',
        source: SaleSource.TIKTOK_LIVE_MANUAL,
        price: 4000,
        createdByAdminId: 'admin-1',
        shouldCreatePrintJob: true,
      },
      { actorType: ActorType.ADMIN, actorId: 'admin-1' },
    );

    expect(result.items).toHaveLength(1);
    expect(result.labelPrintJobs).toHaveLength(1);
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ itemsCount: { increment: 1 } }),
      }),
    );
    expect(labels.createPrintJob).toHaveBeenCalledTimes(1);
  });

  it('creates multiple order items for quantity greater than one', async () => {
    const { service } = makeSalesHarness();

    const result = await service.createSoldItem(
      {
        customerId: 'customer-1',
        categoryId: 'cat-1',
        source: SaleSource.ADMIN_MANUAL,
        price: 3000,
        quantity: 3,
      },
      { actorType: ActorType.ADMIN, actorId: 'admin-1' },
    );

    expect(result.items).toHaveLength(3);
    expect(new Set(result.items.map((item) => item.barcode)).size).toBe(3);
  });

  it('blocks blocked customers', async () => {
    const { service } = makeSalesHarness({ blocked: true });

    await expect(
      service.createSoldItem(
        { customerId: 'customer-1', source: SaleSource.ADMIN_MANUAL, price: 3000 },
        { actorType: ActorType.ADMIN },
      ),
    ).rejects.toMatchObject({ code: 'CUSTOMER_BLOCKED' });
  });

  it('blocks unverified paid purchases when limit is zero', async () => {
    const { service } = makeSalesHarness({ limit: 0 });

    await expect(
      service.createSoldItem(
        { customerId: 'customer-1', source: SaleSource.ADMIN_MANUAL, price: 3000 },
        { actorType: ActorType.ADMIN },
      ),
    ).rejects.toMatchObject({ code: 'CUSTOMER_NOT_VERIFIED' });
  });

  it('allows gifts with price zero', async () => {
    const { service } = makeSalesHarness({ limit: 0 });

    const result = await service.createSoldItem(
      { customerId: 'customer-1', source: SaleSource.ADMIN_MANUAL, price: 0, isGift: true },
      { actorType: ActorType.ADMIN },
    );

    expect(result.items[0].price.toString()).toBe('0');
  });
});

describe('LabelsService', () => {
  function makeLabelHarness() {
    const job = {
      id: 'job-1',
      orderItemId: 'item-1',
      customerId: 'customer-1',
      barcode: 'ITEM-20260713-A8K2M9',
      template: {},
      status: PrintJobStatus.PENDING,
      printerName: null,
      printedByAdminId: null,
      printedAt: null,
      confirmedByAdminId: null,
      confirmedAt: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const item = {
      id: 'item-1',
      barcode: job.barcode,
      price: new Prisma.Decimal(4000),
      source: SaleSource.TIKTOK_LIVE_MANUAL,
      soldAt: new Date('2026-07-13T12:00:00Z'),
      labelStatus: LabelStatus.PENDING,
      isBroken: false,
      isGift: false,
      isReplacement: false,
      customer: { id: 'customer-1', displayName: 'Ahmed', phone: '+9647700000000', whatsappPhone: null },
      category: { id: 'cat-1', name: 'Clothes' },
    };
    const tx = {
      labelPrintJob: {
        findUnique: jest.fn().mockResolvedValue(job),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...job, ...data })),
      },
      orderItem: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
      appSettings: {
        upsert: jest.fn().mockResolvedValue({
          storeName: 'Abo Essa Store',
          currency: 'IQD',
          labelTemplate: {},
        }),
      },
      orderItem: {
        findUnique: jest.fn().mockResolvedValue(item),
      },
    };
    const socketMock = sockets();
    const service = new LabelsService(prisma as any, auditLogs() as any, socketMock as any);
    return { service, prisma, tx, socketMock };
  }

  it('generates label payloads', async () => {
    const { service } = makeLabelHarness();

    const payload = await service.createLabelPayload('item-1');

    expect(payload.itemBarcode).toBe('ITEM-20260713-A8K2M9');
    expect(payload.customerName).toBe('Ahmed');
    expect(payload.currency).toBe('IQD');
  });

  it('mark printed updates print job and order item', async () => {
    const { service, tx } = makeLabelHarness();

    await service.markPrinted('job-1', 'admin-1');

    expect(tx.labelPrintJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: PrintJobStatus.PRINTED }) }),
    );
    expect(tx.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ labelStatus: LabelStatus.PRINTED }) }),
    );
  });

  it('confirm attached updates print job and order item', async () => {
    const { service, tx } = makeLabelHarness();

    await service.confirmAttached('job-1', 'admin-1');

    expect(tx.labelPrintJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: PrintJobStatus.CONFIRMED_ATTACHED }) }),
    );
    expect(tx.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ labelStatus: LabelStatus.ATTACHED }) }),
    );
  });
});

describe('SalesSessionsService', () => {
  it('starts a sales session', async () => {
    const socketMock = sockets();
    const prisma = {
      liveSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'session-1', status: LiveSessionStatus.ACTIVE }),
      },
    };
    const service = new SalesSessionsService(prisma as any, auditLogs() as any, socketMock as any);

    const session = await service.start(
      { title: 'TikTok live', source: LiveSessionSource.TIKTOK_EXTERNAL },
      'admin-1',
      request,
    );

    expect(session.id).toBe('session-1');
    expect(socketMock.emitSessionUpdated).toHaveBeenCalled();
  });

  it('ends an active session', async () => {
    const prisma = {
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 'session-1', status: LiveSessionStatus.ACTIVE }),
        update: jest.fn().mockResolvedValue({ id: 'session-1', status: LiveSessionStatus.ENDED }),
      },
    };
    const service = new SalesSessionsService(prisma as any, auditLogs() as any, sockets() as any);

    const session = await service.end('session-1', 'admin-1', request);

    expect(session.status).toBe(LiveSessionStatus.ENDED);
  });

  it('prevents ending an already ended session', async () => {
    const prisma = {
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 'session-1', status: LiveSessionStatus.ENDED }),
      },
    };
    const service = new SalesSessionsService(prisma as any, auditLogs() as any, sockets() as any);

    await expect(service.end('session-1', 'admin-1', request)).rejects.toMatchObject({
      code: 'SESSION_ALREADY_ENDED',
    });
  });
});

describe('WarehouseService', () => {
  it('label pending returns only pending items from query result', async () => {
    const pendingItem = {
      id: 'item-1',
      barcode: 'ITEM-1',
      imageUrl: null,
      snapshotUrl: null,
      price: new Prisma.Decimal(4000),
      source: SaleSource.ADMIN_MANUAL,
      soldAt: new Date(),
      labelStatus: LabelStatus.PENDING,
      isBroken: false,
      isGift: false,
      isReplacement: false,
      customer: { id: 'customer-1', displayName: 'Ahmed', phone: '+9647700000000' },
      category: { id: 'cat-1', name: 'Clothes' },
    };
    const prisma = {
      appSettings: { upsert: jest.fn().mockResolvedValue({ currency: 'IQD' }) },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([pendingItem]),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn().mockImplementation((promises) => Promise.all(promises)),
    };
    const service = new WarehouseService(prisma as any, {} as any, auditLogs() as any);

    const result = await service.labelPending({ page: 1, limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].labelStatus).toBe(LabelStatus.PENDING);
  });

  it('confirm attached delegates to label service and returns updated item', async () => {
    const labels = { confirmAttachedByItem: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const prisma = {
      orderItem: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'item-1', labelStatus: LabelStatus.ATTACHED }),
      },
    };
    const service = new WarehouseService(prisma as any, labels as any, auditLogs() as any);

    const result = await service.confirmLabelAttached('item-1', 'admin-1');

    expect(labels.confirmAttachedByItem).toHaveBeenCalledWith('item-1', 'admin-1');
    expect(result.item.labelStatus).toBe(LabelStatus.ATTACHED);
  });
});
