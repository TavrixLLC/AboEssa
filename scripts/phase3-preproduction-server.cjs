// Disposable validation server. No dotenv or arbitrary database target accepted.
if (process.env.REZONA_IMAGE_QA !== '1') throw new Error('Explicit isolated QA flag required');
const { randomUUID } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const { setTimeout: sleep } = require('node:timers/promises');
const port = 58443;
const origin = `http://127.0.0.1:${port}`;
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://phase2_qa:phase2-test-local-only@127.0.0.1:55442/rezona_phase2_qa',
  REDIS_URL: 'redis://127.0.0.1:56382',
  MINIO_ENDPOINT: '127.0.0.1',
  MINIO_PORT: '59042',
  MINIO_USE_SSL: 'false',
  MINIO_ACCESS_KEY: 'phase2-qa',
  MINIO_SECRET_KEY: 'phase2-test-local-only',
  MINIO_BUCKET: `rezona-validation-${randomUUID()}`,
  JWT_ADMIN_ACCESS_SECRET: randomUUID() + randomUUID(),
  JWT_CUSTOMER_ACCESS_SECRET: randomUUID() + randomUUID(),
  IMAGE_OPTIMIZATION_ENABLED: 'true',
  API_PREFIX: 'api',
  PUBLIC_BASE_URL: origin,
  PUSH_PROVIDER: 'disabled',
  THROTTLE_LIMIT: '10000',
});
require('reflect-metadata');
const express = require('express');
const compression = require('compression');
const { ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/src/app.module');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { UploadsService } = require('../dist/src/uploads/uploads.service');
const { TokenService } = require('../dist/src/auth/token.service');
const { HttpExceptionFilter } = require('../dist/src/common/filters/http-exception.filter');
const {
  ResponseEnvelopeInterceptor,
} = require('../dist/src/common/interceptors/response-envelope.interceptor');

async function regression(app, prisma, admin, category) {
  const checks = [];
  const token = app.get(TokenService);
  const buyers = await Promise.all(
    [0, 1, 2].map((i) =>
      prisma.customer.create({
        data: {
          displayName: `PHASE3 QA BUYER ${i}`,
          phone: `+1555${String(Date.now()).slice(-7)}${i}`,
          wallet: { create: { availableBalance: i === 2 ? 0 : 200000 } },
        },
      }),
    ),
  );
  const tokens = await Promise.all(buyers.map((c) => token.signCustomerAccess(c)));
  const delivery = {
    fullName: 'QA Only',
    phone: '+15550100000',
    governorate: 'QA',
    city: 'QA',
    addressLine: 'Disposable test address',
  };
  const request = async (path, body, buyer = 0, key = randomUUID()) => {
    const r = await fetch(origin + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tokens[buyer]}`,
        'idempotency-key': key,
      },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    return { status: r.status, data: json.data, error: json.code };
  };
  const product = await prisma.productListing.create({
    data: {
      title: 'PHASE3 QA Purchase',
      price: 10000,
      totalQuantity: 3,
      availableQuantity: 3,
      status: 'ACTIVE',
      categoryId: category.id,
      createdByAdminId: admin.id,
    },
  });
  const buy = (method, buyer, key) =>
    request(
      `/api/products/${product.id}/buy`,
      { quantity: 1, paymentMethod: method, delivery },
      buyer,
      key,
    );
  const before = await prisma.customerWallet.findUniqueOrThrow({
    where: { customerId: buyers[0].id },
  });
  const key = randomUUID();
  const paid = await buy('WALLET', 0, key);
  assert.equal(paid.status, 201, JSON.stringify(paid));
  const replay = await buy('WALLET', 0, key);
  assert.equal(replay.status, 201, JSON.stringify(replay));
  const after = await prisma.customerWallet.findUniqueOrThrow({
    where: { customerId: buyers[0].id },
  });
  assert.equal(before.availableBalance.minus(after.availableBalance).toNumber(), 10000);
  assert.equal(
    (await prisma.productListing.findUniqueOrThrow({ where: { id: product.id } }))
      .availableQuantity,
    2,
  );
  checks.push('wallet purchase and replay debit/stock exactly once');
  const cod = await buy('CASH_ON_DELIVERY', 1);
  assert.equal(cod.status, 201, JSON.stringify(cod));
  assert.equal(
    (
      await prisma.customerWallet.findUniqueOrThrow({ where: { customerId: buyers[1].id } })
    ).availableBalance.toNumber(),
    200000,
  );
  checks.push('direct COD does not debit wallet');
  const insufficient = await buy('WALLET', 2);
  assert.equal(insufficient.status, 409, JSON.stringify(insufficient));
  assert.equal(
    (await prisma.productListing.findUniqueOrThrow({ where: { id: product.id } }))
      .availableQuantity,
    1,
  );
  checks.push('insufficient wallet rolls back inventory and sale');
  const competing = await Promise.all([buy('CASH_ON_DELIVERY', 0), buy('CASH_ON_DELIVERY', 1)]);
  assert.equal(competing.filter((x) => x.status === 201).length, 1, JSON.stringify(competing));
  assert.equal(
    (await prisma.productListing.findUniqueOrThrow({ where: { id: product.id } }))
      .availableQuantity,
    0,
  );
  checks.push('concurrent final-unit claims cannot oversell');
  const auction = await prisma.auction.create({
    data: {
      title: 'PHASE3 QA Win',
      categoryId: category.id,
      createdByAdminId: admin.id,
      startingPrice: 10000,
      currentPrice: 10000,
      minIncrement: 1000,
      startsAt: new Date(Date.now() - 60000),
      endsAt: new Date(Date.now() + 86400000),
      originalEndsAt: new Date(Date.now() + 86400000),
      extensionSeconds: 30,
      extensionTriggerSeconds: 30,
      maxExtensions: 5,
      status: 'ACTIVE',
    },
  });
  const bid = await request(`/api/auctions/${auction.id}/bids`, { amount: 11000 }, 0);
  assert.equal(bid.status, 201, JSON.stringify(bid));
  const held = await prisma.customerWallet.findUniqueOrThrow({
    where: { customerId: buyers[0].id },
  });
  assert.equal(held.reservedBalance.toNumber(), 1100);
  const emptyBid = await request(`/api/auctions/${auction.id}/bids`, { amount: 12000 }, 2);
  assert.equal(emptyBid.status, 409, JSON.stringify(emptyBid));
  checks.push('bid reserves ten percent; zero-balance bidder denied');
  await app
    .get(require('../dist/src/auctions/auctions.service').AuctionsService)
    .closeNow(auction.id, admin.id);
  const won = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
  const item = await prisma.orderItem.findUniqueOrThrow({ where: { id: won.soldOrderItemId } });
  assert.ok(item.checkoutConfirmedAt);
  assert.equal(item.walletPaidAmount.toNumber(), 1100);
  assert.equal(item.cashDueAmount.toNumber(), 9900);
  assert.equal(
    (
      await prisma.customerWallet.findUniqueOrThrow({ where: { customerId: buyers[0].id } })
    ).reservedBalance.toNumber(),
    0,
  );
  checks.push('auction win automatically confirms order and settles COD deposit once');
  const balance = (
    await prisma.customerWallet.findUniqueOrThrow({ where: { customerId: buyers[0].id } })
  ).availableBalance;
  const remainder = await request(`/api/customer/orders/${item.orderId}/pay-wallet`, {}, 0);
  assert.ok([200, 201].includes(remainder.status), JSON.stringify(remainder));
  const again = await request(`/api/customer/orders/${item.orderId}/pay-wallet`, {}, 0);
  assert.ok([200, 201].includes(again.status), JSON.stringify(again));
  assert.equal(
    balance
      .minus(
        (await prisma.customerWallet.findUniqueOrThrow({ where: { customerId: buyers[0].id } }))
          .availableBalance,
      )
      .toNumber(),
    9900,
  );
  checks.push('confirmed order remainder wallet payment is replay-safe');
  await prisma.order.update({ where: { id: item.orderId }, data: { status: 'SHIPPED' } });
  const locked = await request(`/api/customer/orders/${item.orderId}/pay-wallet`, {}, 0);
  assert.equal(locked.status, 409, JSON.stringify(locked));
  checks.push('shipped order payment is locked');
  return checks;
}

async function main() {
  const app = await NestFactory.create(AppModule, {
    logger: ['warn', 'error'],
    abortOnError: false,
  });
  const requests = [];
  const reports = [];
  let stage = 'setup';
  let mode = 'cold';
  let lastChange;
  let images = [];
  let product;
  let pendingClear = true;
  const server = app.getHttpAdapter().getInstance();
  server.use((req, res, next) => {
    if (req.path.startsWith('/__phase3/')) return next();
    const entry = { stage, path: req.originalUrl, bytes: 0 };
    const write = res.write.bind(res),
      end = res.end.bind(res);
    const count = (chunk) => {
      if (chunk)
        entry.bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
    };
    res.write = (chunk, ...args) => {
      count(chunk);
      return write(chunk, ...args);
    };
    res.end = (chunk, ...args) => {
      count(chunk);
      return end(chunk, ...args);
    };
    res.once('finish', () =>
      requests.push({
        ...entry,
        status: res.statusCode,
        mime: res.getHeader('content-type'),
        cache: res.getHeader('cache-control'),
      }),
    );
    next();
  });
  server.use(compression());
  server.post('/__phase3/control', express.json({ limit: '256kb' }), async (req, res) => {
    try {
      const { action, value } = req.body;
      if (action === 'mode') {
        mode = value;
        pendingClear = value === 'cold';
        return res.json({ mode });
      }
      if (action === 'begin') {
        return res.json({ mode, clearDisk: pendingClear, productId: product.id });
      }
      if (action === 'stage') {
        stage = String(value);
        requests.length = 0;
        return res.json({ stage });
      }
      if (action === 'snapshot')
        return res.json({
          requests: [...requests],
          encodedBodyBytes: requests.reduce((n, x) => n + x.bytes, 0),
        });
      if (action === 'changeImage') {
        const old = product.imageUrls[0];
        const url = old === images[9] ? images[0] : images[9];
        product = await app
          .get(PrismaService)
          .productListing.update({ where: { id: product.id }, data: { imageUrls: [url] } });
        lastChange = { old, url };
        return res.json(lastChange);
      }
      if (action === 'result') {
        reports.push({ ...value, lastImageChange: lastChange });
        pendingClear = false;
        console.log('PHASE3_DEVICE_RESULT ' + JSON.stringify(reports.at(-1)));
        return res.json({ saved: true });
      }
      return res.status(400).json({ error: 'unsupported QA action' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  server.get('/__phase3/results', (_, res) => res.json(reports));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  // Loopback only by default. ADB reverse is NOT a Wi-Fi/mobile measurement.
  await app.listen(port, '127.0.0.1');
  const prisma = app.get(PrismaService);
  const id = randomUUID();
  const email = `phase3-${id}@example.test`;
  const admin = await prisma.adminUser.create({
    data: {
      name: 'PHASE3 QA',
      email,
      normalizedEmail: email,
      passwordHash: 'not-a-login',
      role: 'OWNER',
      isOwner: true,
    },
  });
  const category = await prisma.category.create({
    data: { name: 'إلكترونيات QA', slug: `phase3-${id}` },
  });
  console.log(
    'PHASE3_TRANSACTIONS ' + JSON.stringify(await regression(app, prisma, admin, category)),
  );
  const fixtures = resolve(__dirname, '../demo-assets/google-play-catalog');
  for (const name of (await readdir(fixtures)).filter((x) => x.endsWith('.png')).slice(0, 10)) {
    const body = await readFile(resolve(fixtures, name));
    const asset = await app
      .get(UploadsService)
      .uploadImage(
        { originalname: name, mimetype: 'image/png', size: body.length, buffer: body },
        { folder: 'products' },
        admin.id,
      );
    images.push(asset.url);
  }
  for (let i = 0; i < 1000; i++) {
    const p = await prisma.productListing.create({
      data: {
        title: `إِلِكتروني موديل ${i}`,
        description: 'QA product description '.repeat(50),
        price: 10000 + i,
        totalQuantity: 20,
        availableQuantity: 20,
        status: 'ACTIVE',
        imageUrls: [images[i % 9]],
        categoryId: category.id,
        createdByAdminId: admin.id,
        createdAt: new Date(Date.now() - i * 1000),
      },
    });
    if (i === 0) product = p;
  }
  for (let i = 0; i < 20; i++)
    await prisma.auction.create({
      data: {
        title: `مزاد إلكتروني ${i}`,
        categoryId: category.id,
        createdByAdminId: admin.id,
        status: 'ACTIVE',
        startingPrice: 10000,
        currentPrice: 10000,
        minIncrement: 1000,
        startsAt: new Date(Date.now() - 60000),
        endsAt: new Date(Date.now() + 86400000),
        originalEndsAt: new Date(Date.now() + 86400000),
        extensionSeconds: 30,
        extensionTriggerSeconds: 30,
        maxExtensions: 5,
        imageUrls: [images[i % 9]],
        rarity: 'RARE',
      },
    });
  for (let i = 0; i < 180; i++) {
    const completed = await prisma.fileAssetImageJob.count({
      where: { asset: { uploadedByAdminId: admin.id }, status: 'COMPLETED' },
    });
    if (completed === 10) break;
    if (i === 179) throw new Error('QA image jobs did not complete');
    await sleep(500);
  }
  console.log(
    'PHASE3_QA_READY ' + JSON.stringify({ origin, products: 1000, auctions: 20, variants: 80 }),
  );
  const close = async () => {
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
