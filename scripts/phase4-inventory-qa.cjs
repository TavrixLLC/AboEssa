// Explicit disposable Phase 4 services. Never reads dotenv or accepts a DB URL.
if (process.env.REZONA_PHASE4_QA !== '1') throw Error('Explicit Phase 4 QA flag required');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const mode = process.argv[2] || 'baseline';
if (!['baseline', 'integration'].includes(mode)) throw Error('Invalid QA mode');
const origin = 'http://127.0.0.1:58453';
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://phase4_qa:phase4-local-only@127.0.0.1:55444/rezona_phase4_qa',
  REDIS_URL: 'redis://127.0.0.1:56384',
  MINIO_ENDPOINT: '127.0.0.1',
  MINIO_PORT: '59044',
  MINIO_USE_SSL: 'false',
  MINIO_ACCESS_KEY: 'phase4-qa',
  MINIO_SECRET_KEY: 'phase4-local-only',
  MINIO_BUCKET: 'phase4-qa',
  JWT_ADMIN_ACCESS_SECRET: randomUUID() + randomUUID(),
  JWT_CUSTOMER_ACCESS_SECRET: randomUUID() + randomUUID(),
  PUSH_PROVIDER: 'disabled',
  IMAGE_OPTIMIZATION_ENABLED: 'false',
  PUBLIC_BASE_URL: origin,
  API_PREFIX: 'api',
  INVENTORY_MANAGEMENT_ENABLED: mode === 'integration' ? 'true' : 'false',
  THROTTLE_LIMIT: '10000',
});
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { AppModule } = require('../dist/src/app.module');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { TokenService } = require('../dist/src/auth/token.service');
const { HttpExceptionFilter } = require('../dist/src/common/filters/http-exception.filter');
const {
  ResponseEnvelopeInterceptor,
} = require('../dist/src/common/interceptors/response-envelope.interceptor');
async function run() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  await app.listen(58453, '127.0.0.1');
  const db = app.get(PrismaService),
    tokens = app.get(TokenService),
    checks = [];
  try {
    const uid = randomUUID();
    const admin = await db.adminUser.create({
      data: {
        name: 'PHASE4 QA OWNER',
        email: `phase4-${uid}@example.test`,
        normalizedEmail: `phase4-${uid}@example.test`,
        passwordHash: 'not-a-login',
        role: 'OWNER',
        isOwner: true,
      },
    });
    const customer = await db.customer.create({
      data: {
        displayName: 'PHASE4 QA BUYER',
        phone: `+1555${Date.now()}`,
        wallet: { create: { availableBalance: 200000 } },
      },
    });
    const category = await db.category.create({
      data: { name: 'إلكترونيات Phase4 QA', slug: `phase4-${uid}` },
    });
    const ownerToken = await tokens.signAdminAccess(admin),
      customerToken = await tokens.signCustomerAccess(customer);
    const request = async (method, url, body, token = ownerToken, key) => {
      const r = await fetch(origin + '/api' + url, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await r.json();
      return { status: r.status, data: json.data, body: json };
    };
    const delivery = {
      fullName: 'QA only',
      phone: '+15550100000',
      governorate: 'QA',
      city: 'QA',
      addressLine: 'Disposable QA address',
    };
    const created = await request('POST', '/admin/products', {
      title: 'PHASE4 twenty units',
      price: 1000,
      quantity: 20,
      categoryId: category.id,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const productId = created.data.id;
    assert.equal((await request('POST', `/admin/products/${productId}/publish`, {})).status, 201);
    const buy = await request(
      'POST',
      `/products/${productId}/buy`,
      { quantity: 4, paymentMethod: 'CASH_ON_DELIVERY', delivery },
      customerToken,
      randomUUID(),
    );
    assert.equal(buy.status, 201, JSON.stringify(buy.body));
    let product = await db.productListing.findUniqueOrThrow({ where: { id: productId } });
    assert.equal(product.availableQuantity, 16);
    assert.equal(product.soldQuantity, 4);
    const items = await db.orderItem.findMany({ where: { orderId: buy.data.orderId } });
    assert.equal(items.length, 4);
    assert.ok(items.every((i) => i.quantity === 1));
    checks.push({
      check: '20 -> purchase 4 -> 16; four separate unit rows',
      productId,
      orderId: buy.data.orderId,
    });
    const cancel = () =>
      request('POST', `/admin/orders/${buy.data.orderId}/actions`, {
        action: 'CANCEL',
        reason: 'Phase4 legitimate QA cancellation',
      });
    assert.equal((await cancel()).status, 201);
    product = await db.productListing.findUniqueOrThrow({ where: { id: productId } });
    assert.equal(product.availableQuantity, 20);
    assert.equal(product.soldQuantity, 0);
    assert.equal((await cancel()).status, 201);
    product = await db.productListing.findUniqueOrThrow({ where: { id: productId } });
    assert.equal(product.availableQuantity, 20);
    assert.equal(product.soldQuantity, 0);
    checks.push({
      check: 'Cancellation restores four exactly once; replay remains 20',
      available: 20,
      sold: 0,
    });
    assert.equal(
      String(
        (await db.customerWallet.findUniqueOrThrow({ where: { customerId: customer.id } }))
          .availableBalance,
      ),
      '200000',
    );
    checks.push({ check: 'Direct COD buy/cancel leaves wallet unchanged' });
    if (mode === 'integration')
      await require('./phase4-inventory-checks.cjs')({
        app,
        db,
        request,
        customerToken,
        ownerToken,
        customer,
        admin,
        category,
        delivery,
        checks,
      });
    const result = {
      mode,
      time: new Date().toISOString(),
      database: 'rezona_phase4_qa:55444',
      checks,
      passed: true,
    };
    await fs.mkdir(path.resolve(__dirname, '../docs/benchmarks/phase4'), { recursive: true });
    await fs.writeFile(
      path.resolve(__dirname, `../docs/benchmarks/phase4/${mode}.json`),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
