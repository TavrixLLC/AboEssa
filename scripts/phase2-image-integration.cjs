// Deliberately no production/staging URL arguments or dotenv fallbacks.
if (process.env.REZONA_IMAGE_QA !== '1') {
  throw new Error(
    'Start the isolated loopback QA stack in the Phase 2 guide and set REZONA_IMAGE_QA=1',
  );
}

const { randomUUID, createHash } = require('node:crypto');
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://phase2_qa:phase2-test-local-only@127.0.0.1:55442/rezona_phase2_qa',
  REDIS_URL: 'redis://127.0.0.1:56382',
  MINIO_ENDPOINT: '127.0.0.1',
  MINIO_PORT: '59042',
  MINIO_USE_SSL: 'false',
  MINIO_ACCESS_KEY: 'phase2-qa',
  MINIO_SECRET_KEY: 'phase2-test-local-only',
  MINIO_BUCKET: `rezona-phase2-${randomUUID()}`,
  JWT_ADMIN_ACCESS_SECRET: randomUUID() + randomUUID(),
  JWT_CUSTOMER_ACCESS_SECRET: randomUUID() + randomUUID(),
  IMAGE_OPTIMIZATION_ENABLED: 'true',
  IMAGE_OPTIMIZATION_CONCURRENCY: '1',
  IMAGE_MAX_PIXELS: '12000000',
  UPLOAD_MAX_BYTES: '1800000',
  UPLOAD_ALLOWED_MIME: 'image/jpeg,image/png,image/webp',
  API_PREFIX: 'api',
  PUBLIC_BASE_URL: 'http://127.0.0.1:8080',
  PUSH_PROVIDER: 'disabled',
});

require('reflect-metadata');
const assert = require('node:assert/strict');
const { resolve, join } = require('node:path');
const { readFile, readdir } = require('node:fs/promises');
const { setTimeout: sleep } = require('node:timers/promises');
const express = require('express');
const { ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/src/app.module');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { STORAGE_PROVIDER } = require('../dist/src/files/storage-provider.interface');
const { TokenService } = require('../dist/src/auth/token.service');
const { HttpExceptionFilter } = require('../dist/src/common/filters/http-exception.filter');
const {
  ResponseEnvelopeInterceptor,
} = require('../dist/src/common/interceptors/response-envelope.interceptor');
const {
  ImageOptimizationService,
} = require('../dist/src/image-optimization/image-optimization.service');
const { scheduleImageBackfill } = require('../dist/src/maintenance/backfill-image-variants');

const fixtureDir = resolve(__dirname, '../demo-assets/google-play-catalog');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function waitFor(prisma, assetId, status) {
  for (let i = 0; i < 160; i++) {
    const job = await prisma.fileAssetImageJob.findFirst({ where: { assetId } });
    if (job?.status === status) return job;
    if (job?.status === 'FAILED' && status !== 'FAILED')
      throw new Error(`Unexpected failure: ${job.errorCode}`);
    await sleep(250);
  }
  throw new Error(`Image job did not reach ${status}`);
}

async function main() {
  const app = await NestFactory.create(AppModule, {
    logger: ['warn', 'error'],
    abortOnError: false,
  });
  try {
    app.setGlobalPrefix('api');
    app.use('/uploads', express.static(fixtureDir));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const prisma = app.get(PrismaService);
    const storage = app.get(STORAGE_PROVIDER);
    const save = storage.putObject.bind(storage);
    let variantWrites = 0;
    // Simulate a transient MinIO write failure after one deterministic blob was
    // already stored. The real BullMQ worker must retry without duplicate rows.
    storage.putObject = async (input) => {
      if (input.key.startsWith('catalog-variants/') && ++variantWrites === 2) {
        throw new Error('QA_TRANSIENT_STORAGE_ERROR');
      }
      return save(input);
    };
    const id = randomUUID();
    const email = `phase2-${id}@example.test`;
    const admin = await prisma.adminUser.create({
      data: {
        name: 'Image QA',
        email,
        normalizedEmail: email,
        passwordHash: 'not-a-login',
        role: 'OWNER',
        isOwner: true,
      },
    });
    const category = await prisma.category.create({
      data: { name: 'Image QA', slug: `phase2-${id}` },
    });
    const bearer = await app.get(TokenService).signAdminAccess(admin);
    const upload = (body, mimeType, folder) => {
      const form = new FormData();
      form.append('folder', folder);
      form.append('file', new Blob([body], { type: mimeType }), 'test.png');
      return fetch(`${origin}/api/admin/uploads/images`, {
        method: 'POST',
        body: form,
        headers: { authorization: `Bearer ${bearer}` },
      });
    };
    const get = (path) => fetch(origin + path, { signal: AbortSignal.timeout(5000) });
    const original = await readFile(join(fixtureDir, 'headphones.png'));
    const exactOriginal = async (path) => {
      const response = await get(path);
      assert.equal(response.status, 200);
      assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(original));
      return response;
    };

    assert.equal((await upload(Buffer.alloc(1_800_001), 'image/png', 'products')).status, 413);
    assert.equal((await upload(original.subarray(0, 48), 'image/png', 'products')).status, 422);
    assert.equal((await upload(original, 'image/jpeg', 'products')).status, 415);

    const uploaded = await upload(original, 'image/png', 'products');
    assert.equal(uploaded.status, 201, await uploaded.clone().text());
    const { data: result } = await uploaded.json();
    const asset = await prisma.fileAsset.findUniqueOrThrow({
      where: { key: result.key },
      include: { imageJobs: true },
    });
    assert.equal(asset.imageJobs.length, 1);
    assert.equal((await exactOriginal(result.url)).headers.get('cache-control'), 'no-store');
    await exactOriginal('/uploads/headphones.png');
    const product = await prisma.productListing.create({
      data: {
        title: 'Image QA product',
        price: 10000,
        categoryId: category.id,
        imageUrls: [result.url],
        createdByAdminId: admin.id,
      },
    });

    const job = await waitFor(prisma, asset.id, 'COMPLETED');
    assert.equal(job.attempts, 2);
    assert.equal(job.sourceHash, digest(original));
    const variants = await prisma.fileAssetVariant.findMany({ where: { assetId: asset.id } });
    assert.equal(variants.length, 8);
    const catalog = variants.find((v) => v.variantType === 'CATALOG' && v.format === 'WEBP');
    const variantPath = `/api/media/catalog-variants/v/${catalog.storageKey.split('/')[1]}`;
    assert.equal((await get(result.url + '/variants')).status, 404);
    const draftRequest = await get(variantPath);
    assert.equal(draftRequest.status, 404);
    assert.equal(draftRequest.headers.get('cache-control'), 'no-store');
    const privateBatch = await get('/api/catalog/media?keys=' + encodeURIComponent(result.key));
    assert.equal(privateBatch.status, 200);
    assert.deepEqual((await privateBatch.json()).data.imageMedia, []);
    assert.equal((await get(`/api/media/${catalog.storageKey}`)).status, 404);
    assert.equal((await get('/api/media/private-intakes/private.png')).status, 404);

    await prisma.productListing.update({ where: { id: product.id }, data: { status: 'ACTIVE' } });
    const productResponse = await get(`/api/products/${product.id}`);
    assert.equal(productResponse.status, 200);
    assert.deepEqual((await productResponse.json()).data.imageUrls, [result.url]);
    const manifest = await get(result.url + '/variants');
    assert.equal(manifest.status, 200);
    assert.equal((await manifest.json()).data.variants.length, 8);
    const cardResponse = await fetch(origin + '/api/catalog/products?limit=20', {
      headers: { 'X-Catalog-Media': '1' },
    });
    assert.equal(cardResponse.status, 200);
    const cardPayload = await cardResponse.json();
    const cardMedia = cardPayload.imageMedia ?? cardPayload.data.imageMedia;
    assert(cardMedia.some((m) => m.originalUrl === result.url));
    assert.equal(cardMedia.find((m) => m.originalUrl === result.url).variants.length, 4);
    assert.equal(
      cardPayload.data.items.some((p) => p.id === product.id),
      true,
    );
    const publicBatch = await get('/api/catalog/media?keys=' + encodeURIComponent(result.key));
    assert.equal(publicBatch.status, 200);
    assert.equal((await publicBatch.json()).data.imageMedia.length, 1);
    const oldResponse = await get('/api/products?limit=20');
    const oldPayload = await oldResponse.json();
    assert.equal(oldPayload.imageMedia, undefined, 'old clients must not pay for variant metadata');
    for (const v of variants) {
      const image = await get(`/api/media/catalog-variants/v/${v.storageKey.split('/')[1]}`);
      assert.equal(image.status, 200);
      assert.equal(image.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      assert.equal(
        image.headers.get('content-type'),
        v.format === 'WEBP' ? 'image/webp' : 'image/jpeg',
      );
      assert.equal(digest(Buffer.from(await image.arrayBuffer())), v.contentHash);
    }
    await app.get(ImageOptimizationService).process(job.id);
    assert.equal(await prisma.fileAssetVariant.count({ where: { assetId: asset.id } }), 8);

    const imported = [];
    for (const [index, name] of (await readdir(fixtureDir))
      .filter((n) => n.endsWith('.png'))
      .entries()) {
      const folder = index === 0 ? 'auctions' : 'products';
      const body = await readFile(join(fixtureDir, name));
      const saved = await storage.putObject({
        key: `${folder}/qa-${id}-${name}`,
        body,
        mimeType: 'image/png',
        size: body.length,
      });
      imported.push(await prisma.fileAsset.create({ data: saved }));
    }
    const broken = original.subarray(0, 48);
    const brokenFile = await storage.putObject({
      key: `products/qa-${id}-broken.png`,
      body: broken,
      mimeType: 'image/png',
      size: broken.length,
    });
    const brokenAsset = await prisma.fileAsset.create({ data: brokenFile });
    const params = { apply: false, retryFailed: false, limit: 500, batchSize: 3 };
    const dryRun = await scheduleImageBackfill(prisma, params);
    assert.equal(dryRun.scanned, 11);
    assert.equal(await prisma.fileAssetImageJob.count({ where: { assetId: brokenAsset.id } }), 0);
    const first = await scheduleImageBackfill(prisma, { ...params, apply: true });
    const second = await scheduleImageBackfill(prisma, { ...params, apply: true });
    assert.equal(first.scheduled, 11);
    assert.equal(second.scheduled, 0);
    await Promise.all(imported.map((item) => waitFor(prisma, item.id, 'COMPLETED')));
    await waitFor(prisma, brokenAsset.id, 'FAILED');
    const originalAfterFailure = await get(brokenFile.url);
    assert.equal(originalAfterFailure.status, 200);
    assert.deepEqual(Buffer.from(await originalAfterFailure.arrayBuffer()), broken);

    const now = new Date();
    const end = new Date(now.getTime() + 600000);
    const auction = await prisma.auction.create({
      data: {
        title: 'Image QA auction',
        categoryId: category.id,
        imageUrls: [imported[0].url],
        startingPrice: 10000,
        currentPrice: 10000,
        minIncrement: 500,
        status: 'ACTIVE',
        startsAt: now,
        endsAt: end,
        originalEndsAt: end,
        extensionSeconds: 180,
        extensionTriggerSeconds: 60,
        maxExtensions: 4,
        createdByAdminId: admin.id,
      },
    });
    const auctionResponse = await get(`/api/auctions/${auction.id}`);
    assert.equal(auctionResponse.status, 200);
    assert.deepEqual((await auctionResponse.json()).data.imageUrls, [imported[0].url]);
    assert.equal((await get(imported[0].url + '/variants')).status, 200);
    assert.equal((await get('/api/marketplace?page=1&limit=20')).status, 200);
    console.log(
      'PASS: Nest multipart limits, corrupt/MIME rejection, private variant gating, original hashes, legacy uploads, all 8 byte checks, 10-fixture BullMQ backfill, transient retry without duplicates, rerun, failure fallback, product and auction contracts',
    );
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
