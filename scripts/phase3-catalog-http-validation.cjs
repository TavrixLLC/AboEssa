if (process.env.REZONA_IMAGE_QA !== '1') throw new Error('Isolated QA flag required');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://phase2_qa:phase2-test-local-only@127.0.0.1:55442/rezona_phase2_qa' },
  },
});
const origin = 'http://127.0.0.1:58443';
const checks = [];
async function get(path, media = false) {
  const r = await fetch(origin + path, {
    headers: media ? { 'X-Catalog-Media': '1' } : {},
    signal: AbortSignal.timeout(10000),
  });
  const body = await r.json();
  return { status: r.status, body, headers: r.headers };
}
async function main() {
  const category = await db.category.findFirstOrThrow({
    where: {
      slug: { startsWith: 'phase3-' },
      productListings: { some: { title: 'إِلِكتروني موديل 999' } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const base = `/api/catalog/products?categoryId=${category.id}&limit=40`;
  let cursor = null;
  const ids = [];
  let first;
  let pages = 0;
  do {
    const r = await get(base + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), true);
    assert.equal(r.status, 200);
    const data = r.body.data;
    if (!first) first = r;
    ids.push(...data.items.map((i) => i.id));
    pages++;
    assert.ok(pages < 100);
    cursor = data.meta.nextCursor;
    assert.equal(data.meta.hasMore, !!cursor);
  } while (cursor);
  assert.equal(ids.length, 1000);
  assert.equal(new Set(ids).size, 1000);
  checks.push({ check: 'HTTP cursor walk', pages, distinctItems: ids.length });
  const invalid = await get(
    base + '&search=changed&cursor=' + encodeURIComponent(first.body.data.meta.nextCursor),
  );
  assert.equal(invalid.status, 400);
  checks.push({ check: 'cursor filter mismatch rejected', status: invalid.status });
  const search = await get(
    `/api/catalog/products?categoryId=${category.id}&limit=40&search=` +
      encodeURIComponent('الكتروني موديل'),
  );
  assert.equal(search.status, 200);
  assert.deepEqual(
    search.body.data.items.map((i) => i.id),
    first.body.data.items.map((i) => i.id),
  );
  checks.push({
    check: 'Arabic normalized search matches diacritized titles',
    items: search.body.data.items.length,
  });
  const old = await get(`/api/products?categoryId=${category.id}&limit=20`);
  assert.equal(old.status, 200);
  assert.ok(!('imageMedia' in old.body));
  assert.equal(typeof old.body.data.items[0].description, 'string');
  checks.push({
    check: 'legacy response retains detail fields and does not add media without opt-in',
  });
  const item = first.body.data.items[0];
  const oldState = await db.productListing.findUniqueOrThrow({ where: { id: item.id } });
  try {
    const next = await get(base + '&cursor=' + encodeURIComponent(first.body.data.meta.nextCursor));
    await db.productListing.update({ where: { id: item.id }, data: { status: 'CANCELLED' } });
    const after = await get(
      base + '&cursor=' + encodeURIComponent(first.body.data.meta.nextCursor),
    );
    assert.deepEqual(
      after.body.data.items.map((i) => i.id),
      next.body.data.items.map((i) => i.id),
    );
    checks.push({ check: 'hiding a previously seen QA item does not shift next page' });
  } finally {
    await db.productListing.update({ where: { id: item.id }, data: { status: oldState.status } });
  }
  const change = async () => {
    const r = await fetch(origin + '/__phase3/control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'changeImage' }),
    });
    assert.equal(r.status, 200);
    return r.json();
  };
  const before = await get(`/api/products/${item.id}`, true);
  const beforeUrl = before.body.data.imageUrls[0];
  try {
    await change();
    const after = await get(`/api/products/${item.id}`, true);
    assert.notEqual(after.body.data.imageUrls[0], beforeUrl);
    const media = after.body.imageMedia.find((m) => m.originalUrl === after.body.data.imageUrls[0]);
    assert.ok(media);
    const image = media.variants.find((v) => v.type === 'catalog' && v.format === 'webp');
    assert.match(image.url, /catalog-variants\/v\/.+-v1-[a-f0-9]{64}-catalog.webp$/);
    const response = await fetch(origin + image.url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.match(response.headers.get('cache-control'), /immutable/);
    checks.push({
      check:
        'image update produces a different published original/manifest and valid immutable optimized bytes',
      bytes: (await response.arrayBuffer()).byteLength,
    });
  } finally {
    await change();
  }
  console.log(
    JSON.stringify(
      { scope: 'isolated HTTP/Postgres/MinIO; not device measurements', checks },
      null,
      2,
    ),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
