if (process.env.REZONA_IMAGE_QA !== '1')
  throw new Error('Set REZONA_IMAGE_QA=1 for isolated local QA');
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { gzipSync } = require('node:zlib');
const { CatalogService } = require('../dist/src/catalog/catalog.service');
const { ProductsService } = require('../dist/src/products/products.service');
const prisma = new PrismaClient({
  datasourceUrl: 'postgresql://phase2_qa:phase2-test-local-only@127.0.0.1:55442/rezona_phase2_qa',
  log: [{ emit: 'event', level: 'query' }],
});
let queryDuration = 0;
prisma.$on('query', (event) => {
  queryDuration += event.duration;
});
const legacy = new ProductsService(prisma);
const catalog = new CatalogService(prisma);
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));

async function measure(fn) {
  const samples = [];
  const sql = [];
  let payload;
  for (let n = 0; n < 25; n++) {
    queryDuration = 0;
    const start = performance.now();
    payload = await fn();
    samples.push(performance.now() - start);
    sql.push(queryDuration);
  }
  samples.sort((a, b) => a - b);
  sql.sort((a, b) => a - b);
  return {
    p50Ms: +samples[12].toFixed(2),
    p95Ms: +samples[23].toFixed(2),
    sqlP50Ms: sql[12],
    payloadBytes: bytes(payload),
    gzipBytes: gzipSync(JSON.stringify(payload)).length,
  };
}

async function main() {
  const run = randomUUID();
  const email = `catalog-${run}@example.test`;
  const owner = await prisma.adminUser.create({
    data: {
      name: 'Catalog QA',
      email,
      normalizedEmail: email,
      passwordHash: 'no-login',
      role: 'OWNER',
      isOwner: true,
    },
  });
  const results = [];
  for (const count of [100, 1000, 10000]) {
    const category = await prisma.category.create({
      data: { name: 'QA', slug: `cat-${run}-${count}` },
    });
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    for (let offset = 0; offset < count; offset += 500) {
      await prisma.productListing.createMany({
        data: Array.from({ length: Math.min(500, count - offset) }, (_, n) => ({
          id: `qa-${run}-${count}-${String(offset + n).padStart(5, '0')}`,
          title: `إلكَتروني موديل ${offset + n}`,
          description: 'تفاصيل المنتج الطويلة '.repeat(120),
          categoryId: category.id,
          createdByAdminId: owner.id,
          status: 'ACTIVE',
          imageUrls: [
            '/api/media/products/google-play-headphones.png',
            '/api/media/products/google-play-air-fryer.png',
            '/api/media/products/google-play-instant-camera.png',
          ],
          price: 10000,
          totalQuantity: 4,
          availableQuantity: 4,
          soldQuantity: 0,
          createdAt,
        })),
      });
    }
    await prisma.auction.createMany({
      data: Array.from({ length: 7 }, (_, n) => ({
        id: `qa-auction-${run}-${count}-${n}`,
        title: `مزاد ${n}`,
        categoryId: category.id,
        imageUrls: ['/api/media/auctions/google-play-headphones.png'],
        startingPrice: 10000,
        currentPrice: 10000,
        minIncrement: 500,
        status: 'ACTIVE',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
        originalEndsAt: new Date(Date.now() + 3600000),
        extensionSeconds: 180,
        extensionTriggerSeconds: 60,
        maxExtensions: 4,
        createdByAdminId: owner.id,
        createdAt,
      })),
    });
    await prisma.$executeRawUnsafe('ANALYZE "ProductListing"');
    await prisma.$executeRawUnsafe('ANALYZE "Auction"');
    const query = { categoryId: category.id, limit: 20 };
    const old = await measure(() => legacy.findAll({ ...query, page: 1 }, true));
    const fresh = await measure(() => catalog.list('products', query));
    const search = await measure(() =>
      catalog.list('products', { ...query, search: 'الكتروني موديل 95' }),
    );
    const first = await catalog.list('products', query);
    assert.equal(first.items.length, 20);
    const nextQuery = { ...query, cursor: first.meta.nextCursor };
    const next = await catalog.list('products', nextQuery);
    assert.equal(new Set([...first.items, ...next.items].map((v) => v.id)).size, 40);
    await prisma.productListing.update({
      where: { id: first.items[0].id }, data: { status: 'CANCELLED' },
    });
    assert.deepEqual((await catalog.list('products', nextQuery)).items.map((p) => p.id),
      next.items.map((p) => p.id), 'hiding an earlier row must not shift the next boundary');
    await prisma.productListing.update({
      where: { id: first.items[0].id }, data: { status: 'ACTIVE' },
    });
    await assert.rejects(() => catalog.list('products', { ...nextQuery, search: 'different' }));
    // Mutable titles cannot change the immutable creation-time ordering.
    const after = next.items.at(-1).id;
    await prisma.productListing.update({
      where: { id: after },
      data: { title: 'Changed QA title' },
    });
    assert.equal((await catalog.list('products', nextQuery)).items.at(-1).id, after);
    const seen = new Set();
    let cursor;
    let pages = 0;
    do {
      const page = await catalog.list('marketplace', { ...query, cursor });
      for (const item of page.items) {
        const key = `${item.itemType}/${item.id}`;
        assert(!seen.has(key), 'duplicate page item');
        seen.add(key);
      }
      cursor = page.meta.nextCursor ?? undefined;
      pages++;
    } while (cursor);
    assert.equal(seen.size, count + 7);
    const plan = await prisma.$queryRawUnsafe(
      'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT "id" FROM "ProductListing" WHERE "status" = \'ACTIVE\' AND "availableQuantity" > 0 AND "categoryId" = $1 ORDER BY "createdAt" DESC, "id" DESC LIMIT 21',
      category.id,
    );
    results.push({
      count,
      legacy: old,
      cursorCards: fresh,
      search,
      pages,
      verifiedItems: seen.size,
      plan,
    });
  }
  console.log(
    JSON.stringify(
      {
        environment:
          'Windows Node24 to isolated Docker PostgreSQL16; no network shaping; warmed DB; service calls, not HTTP',
        results,
      },
      null,
      2,
    ),
  );
}
main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
