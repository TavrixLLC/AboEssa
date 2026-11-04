import { Prisma, PrismaClient, SaleSource } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import { AdminConsoleService } from 'src/admin-console/admin-console.service';
import { AuctionsService } from 'src/auctions/auctions.service';
import { CheckoutService } from 'src/checkout/checkout.service';
import { LabelsService } from 'src/labels/labels.service';
import { OrderActionsService } from 'src/orders/order-actions.service';
import { SalesService } from 'src/sales/sales.service';
import { WalletService } from 'src/wallet/wallet.service';
import { ShippingService } from 'src/shipping/shipping.service';

// Deliberately opt-in. Never fall back to DATABASE_URL or the developer's .env.
const url = process.env.ADMIN_QA_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('Admin rebuild / real isolated Postgres transactions', () => {
  let db: PrismaClient;
  let auctions: AuctionsService;
  let checkout: CheckoutService;
  let sales: SalesService;
  let orders: OrderActionsService;
  let admin: AdminConsoleService;
  let adminId: string;
  let categoryId: string;
  const request = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'isolated-integration-test' },
  } as Request;
  const address = {
    fullName: 'عميل تجريبي',
    phone: '07700000000',
    governorate: 'بغداد',
    city: 'المنصور',
    addressLine: 'شارع تجريبي 1',
  };

  beforeAll(async () => {
    const target = new URL(url!);
    if (
      target.hostname !== '127.0.0.1' ||
      target.port !== '55439' ||
      target.pathname !== '/rezona_admin_qa'
    ) {
      throw new Error(
        'Refusing integration writes outside the explicitly named isolated QA database',
      );
    }
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.$connect();
    const suffix = randomUUID();
    const actor = await db.adminUser.create({
      data: {
        name: 'QA admin',
        email: `qa-${suffix}@example.invalid`,
        normalizedEmail: `qa-${suffix}@example.invalid`,
        passwordHash: 'not-a-login-password',
        role: 'OWNER',
        isOwner: true,
      },
    });
    adminId = actor.id;
    categoryId = (await db.category.create({ data: { name: 'QA category', slug: `qa-${suffix}` } }))
      .id;
    const audit = { create: jest.fn().mockResolvedValue({}) } as any;
    const sockets = {
      emitSale: jest.fn(),
      emitToAdmins: jest.fn(),
      emitToCustomer: jest.fn(),
      emitToCustomers: jest.fn(),
    } as any;
    const notifications = { createForCustomer: jest.fn().mockResolvedValue({}) } as any;
    const wallet = new WalletService(db as any);
    checkout = new CheckoutService(wallet);
    sales = new SalesService(
      db as any,
      new LabelsService(db as any, audit, sockets),
      audit,
      sockets,
    );
    auctions = new AuctionsService(
      db as any,
      sales,
      audit,
      sockets,
      notifications,
      { add: jest.fn() } as any,
      wallet,
      checkout,
    );
    orders = new OrderActionsService(db as any, wallet, audit, sockets);
    admin = new AdminConsoleService(db as any, wallet, audit, sockets, notifications);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  async function customer(savedAddress = true, balance = 1000000) {
    return db.customer.create({
      data: {
        displayName: 'عميل تجربة',
        wallet: {
          create: {
            availableBalance: balance,
            entries: {
              create: {
                type: 'TEST_CREDIT',
                amount: balance,
                availableAfter: balance,
                reservedAfter: 0,
                referenceId: 'isolated-fixture',
                eventKey: `fixture-${randomUUID()}`,
              },
            },
          },
        },
        ...(savedAddress ? { addresses: { create: { ...address, isDefault: true } } } : {}),
      },
    });
  }

  async function win(savedAddress = true, blockAfterBidding = false) {
    const owner = await customer(savedAddress);
    const now = Date.now();
    const auction = await db.auction.create({
      data: {
        title: 'مزاد اختبار',
        categoryId,
        createdByAdminId: adminId,
        startingPrice: 9000,
        currentPrice: 10000,
        minIncrement: 1000,
        status: 'ACTIVE',
        startsAt: new Date(now - 60000),
        endsAt: new Date(now - 1000),
        originalEndsAt: new Date(now - 1000),
        extensionSeconds: 0,
        extensionTriggerSeconds: 0,
        maxExtensions: 0,
      },
    });
    const bid = await db.bid.create({
      data: {
        customerId: owner.id,
        auctionId: auction.id,
        amount: 10000,
        reservedAmount: 1000,
        walletReserved: true,
        status: 'WINNING',
      },
    });
    const wallet = new WalletService(db as any);
    await db.$transaction(async (tx) => {
      await wallet.reserveBid(tx, owner.id, new Prisma.Decimal(1000), bid.id);
      await tx.auction.update({ where: { id: auction.id }, data: { winningBidId: bid.id } });
    });
    if (blockAfterBidding)
      await db.customer.update({ where: { id: owner.id }, data: { status: 'BLOCKED' } });
    await auctions.closeAuction(auction.id);
    const closed = await db.auction.findUniqueOrThrow({
      where: { id: auction.id },
      include: { soldOrderItem: true },
    });
    return {
      owner,
      auction,
      bid,
      item: closed.soldOrderItem!,
      orderId: closed.soldOrderItem!.orderId,
    };
  }

  async function fixed(method: 'WALLET' | 'CASH_ON_DELIVERY', balance = 1000000) {
    const owner = await customer(true, balance);
    const result = await db.$transaction(async (tx) => {
      const sale = await sales.createSoldItemInTransaction(tx, {
        customerId: owner.id,
        categoryId,
        source: SaleSource.APP_FIXED_PRICE,
        price: 10000,
        title: 'منتج تجربة',
        dedicatedOrder: true,
      });
      return checkout.complete(tx, {
        customerId: owner.id,
        orderId: sale.order.id,
        itemIds: sale.items.map((item) => item.id),
        totalAmount: new Prisma.Decimal(10000),
        paymentMethod: method,
        delivery: address,
        referenceId: sale.items[0].id,
        eventKey: `fixed-${sale.order.id}`,
      });
    });
    return { owner, orderId: result.updatedOrder.id, result };
  }

  it('automatically creates one confirmed COD order, settles only the 10% hold and copies the saved address', async () => {
    const flow = await win();
    expect(flow.item.checkoutStatus).toBe('AWAITING_FULFILLMENT');
    expect(flow.item.checkoutConfirmedAt).not.toBeNull();
    expect(flow.item.walletPaidAmount.toString()).toBe('1000');
    expect(flow.item.cashDueAmount.toString()).toBe('9000');
    expect(flow.item.deliveryAddressSnapshot).toMatchObject(address);
    const wallet = await db.customerWallet.findUniqueOrThrow({
      where: { customerId: flow.owner.id },
    });
    expect(wallet.availableBalance.toString()).toBe('999000');
    expect(wallet.reservedBalance.toString()).toBe('0');
    await auctions.closeAuction(flow.auction.id);
    expect(await db.orderItem.count({ where: { auctionId: flow.auction.id } })).toBe(1);
    expect(
      await db.walletEntry.count({ where: { referenceId: flow.bid.id, type: 'BID_SETTLEMENT' } }),
    ).toBe(1);
    expect(
      await db.auditLog.count({
        where: { entityId: flow.orderId, action: 'order.auto_confirmed_from_auction' },
      }),
    ).toBe(1);
  });

  it('settles an existing winning commitment even if the account was blocked after bidding', async () => {
    const flow = await win(true, true);
    expect(flow.item.checkoutConfirmedAt).not.toBeNull();
    expect(
      (
        await db.customerWallet.findUniqueOrThrow({ where: { customerId: flow.owner.id } })
      ).reservedBalance.toString(),
    ).toBe('0');
  });

  it('keeps a missing-address win confirmed, blocks preparation, and accepts an owned delivery address', async () => {
    const flow = await win(false);
    expect((await admin.order(flow.orderId)).needsAddress).toBe(true);
    await expect(
      admin.changeOrder(flow.orderId, { action: 'PREPARE' }, adminId, request),
    ).rejects.toMatchObject({ code: 'DELIVERY_ADDRESS_REQUIRED' });
    await expect(
      orders.updateDelivery('not-owner', flow.orderId, address, request),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    await orders.updateDelivery(flow.owner.id, flow.orderId, address, request);
    expect((await admin.order(flow.orderId)).needsAddress).toBe(false);
    expect(
      (await admin.changeOrder(flow.orderId, { action: 'PREPARE' }, adminId, request)).displayState,
    ).toBe('PREPARING');
    await expect(
      orders.updateDelivery(flow.owner.id, flow.orderId, address, request),
    ).rejects.toMatchObject({ code: 'ORDER_DELIVERY_LOCKED' });
  });

  it('wallet payment debits only the remaining 90% and a replay does not debit again', async () => {
    const flow = await win();
    await expect(orders.payWithWallet('not-owner', flow.orderId, request)).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
    });
    expect(await orders.payWithWallet(flow.owner.id, flow.orderId, request)).toMatchObject({
      paidAmount: '9000.00',
      alreadyPaid: false,
    });
    expect(await orders.payWithWallet(flow.owner.id, flow.orderId, request)).toMatchObject({
      alreadyPaid: true,
    });
    const wallet = await db.customerWallet.findUniqueOrThrow({
      where: { customerId: flow.owner.id },
    });
    expect(wallet.availableBalance.toString()).toBe('990000');
    const order = await admin.order(flow.orderId);
    expect(order.walletPaidAmount).toBe('10000.00');
    expect(order.cashDueAmount).toBe('0.00');
  });

  it('enforces NEW → PREPARING → READY → SHIPPED → DELIVERED and locks late payment/cancellation', async () => {
    const flow = await fixed('CASH_ON_DELIVERY');
    await expect(
      admin.changeOrder(flow.orderId, { action: 'SHIP', shippingCompany: 'QA' }, adminId, request),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_TRANSITION' });
    for (const action of ['PREPARE', 'READY', 'SHIP', 'DELIVER'] as const) {
      await admin.changeOrder(
        flow.orderId,
        { action, shippingCompany: 'QA carrier', trackingNumber: 'QA-1' },
        adminId,
        request,
      );
    }
    expect((await admin.order(flow.orderId)).displayState).toBe('DELIVERED');
    await expect(
      admin.changeOrder(flow.orderId, { action: 'CANCEL', reason: 'late' }, adminId, request),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_TRANSITION' });
    await expect(orders.payWithWallet(flow.owner.id, flow.orderId, request)).rejects.toMatchObject({
      code: 'ORDER_PAYMENT_LOCKED',
    });
    expect(await db.shipment.count({ where: { orderId: flow.orderId, status: 'DELIVERED' } })).toBe(
      1,
    );
  });

  it('fixed-price COD costs no wallet funds, while wallet checkout charges the full price', async () => {
    const cod = await fixed('CASH_ON_DELIVERY');
    expect(cod.result.walletPaid.toString()).toBe('0');
    expect(cod.result.cashDue.toString()).toBe('10000');
    const paid = await fixed('WALLET');
    expect(paid.result.walletPaid.toString()).toBe('10000');
    expect(
      (
        await db.customerWallet.findUniqueOrThrow({ where: { customerId: paid.owner.id } })
      ).availableBalance.toString(),
    ).toBe('990000');
  });

  it('cancellation requires a reason and refunds exactly the amount paid, only once', async () => {
    const flow = await win();
    await expect(
      admin.changeOrder(flow.orderId, { action: 'CANCEL' }, adminId, request),
    ).rejects.toMatchObject({ code: 'CANCELLATION_REASON_REQUIRED' });
    await admin.changeOrder(
      flow.orderId,
      { action: 'CANCEL', reason: 'طلب العميل' },
      adminId,
      request,
    );
    await admin.changeOrder(
      flow.orderId,
      { action: 'CANCEL', reason: 'طلب العميل' },
      adminId,
      request,
    );
    expect(
      (
        await db.customerWallet.findUniqueOrThrow({ where: { customerId: flow.owner.id } })
      ).availableBalance.toString(),
    ).toBe('1000000');
    expect(
      await db.walletEntry.count({ where: { walletCustomerId: flow.owner.id, type: 'REFUND' } }),
    ).toBe(1);
  });

  it('concurrent payments never double-charge; cancellation after payment refunds the full price', async () => {
    const flow = await win();
    const results = await Promise.allSettled([
      orders.payWithWallet(flow.owner.id, flow.orderId, request),
      orders.payWithWallet(flow.owner.id, flow.orderId, request),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(
      await db.walletEntry.count({ where: { eventKey: `order-wallet-payment:${flow.orderId}` } }),
    ).toBe(1);
    await admin.changeOrder(
      flow.orderId,
      { action: 'CANCEL', reason: 'QA refund' },
      adminId,
      request,
    );
    expect(
      (
        await db.customerWallet.findUniqueOrThrow({ where: { customerId: flow.owner.id } })
      ).availableBalance.toString(),
    ).toBe('1000000');
  });

  it('insufficient wallet funds rolls the purchase and order back atomically', async () => {
    const owner = await customer(true, 1000);
    await expect(
      db.$transaction(async (tx) => {
        const sale = await sales.createSoldItemInTransaction(tx, {
          customerId: owner.id,
          categoryId,
          source: SaleSource.APP_FIXED_PRICE,
          price: 10000,
          dedicatedOrder: true,
        });
        await checkout.complete(tx, {
          customerId: owner.id,
          orderId: sale.order.id,
          itemIds: sale.items.map((item) => item.id),
          totalAmount: new Prisma.Decimal(10000),
          paymentMethod: 'WALLET',
          delivery: address,
          referenceId: sale.items[0].id,
          eventKey: `low-${sale.order.id}`,
        });
      }),
    ).rejects.toMatchObject({ code: 'WALLET_INSUFFICIENT_FUNDS' });
    expect(await db.order.count({ where: { customerId: owner.id } })).toBe(0);
    expect(
      (
        await db.customerWallet.findUniqueOrThrow({ where: { customerId: owner.id } })
      ).availableBalance.toString(),
    ).toBe('1000');
  });

  it('legacy shipping mutations cannot bypass confirmed-order transitions/refunds', async () => {
    const flow = await win();
    const shipment = await db.shipmentRequest.findFirstOrThrow({
      where: { customerId: flow.owner.id },
    });
    const legacy = new ShippingService(db as any, {} as any, {} as any, {} as any);
    for (const mutate of [
      () => legacy.approve(shipment.id, adminId, request),
      () => legacy.pack(shipment.id, adminId, request),
      () => legacy.ship(shipment.id, { shippingCompany: 'QA' }, adminId, request),
      () => legacy.cancel(shipment.id, adminId, request),
    ]) {
      await expect(mutate()).rejects.toMatchObject({ code: 'USE_ORDER_ACTIONS' });
    }
    expect((await admin.order(flow.orderId)).displayState).toBe('NEW');
  });
});
