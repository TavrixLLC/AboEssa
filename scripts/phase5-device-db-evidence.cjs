// Read-only independent verification of the native capture/replenishment pair.
if (process.env.REZONA_PHASE5_QA !== '1') throw Error('Explicit QA flag required');
const { PrismaClient } = require('@prisma/client'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const out = path.resolve(__dirname, '../docs/benchmarks/phase5/device');
const db = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://phase5_qa:phase5-local-only@127.0.0.1:55446/rezona_phase5_qa' },
  },
});
(async () => {
  try {
    const capture = JSON.parse(fs.readFileSync(path.join(out, 'capture.json'), 'utf8'));
    const s = await db.productIntakeSession.findUniqueOrThrow({
      where: { id: capture.observed.serverId },
      include: { createdBy: true, completedProduct: true, images: { include: { asset: true } } },
    });
    assert.equal(s.createdBy.email, 'phase5-device-qa@example.test');
    assert.equal(s.status, 'COMPLETED');
    assert.equal(s.mode, 'NEW');
    const p = s.completedProduct;
    assert.ok(p);
    assert.equal(p.status, 'DRAFT');
    assert.equal(p.totalQuantity, 15);
    assert.equal(p.availableQuantity, 15);
    assert.equal(p.soldQuantity, 0);
    const sessions = await db.productIntakeSession.findMany({
      where: { completedProductId: p.id },
      select: { id: true, mode: true, status: true, quantity: true },
    });
    assert.equal(sessions.length, 2);
    assert.equal(sessions.filter((v) => v.mode === 'NEW').length, 1);
    assert.equal(sessions.filter((v) => v.mode === 'STOCK_IN').length, 1);
    const movements = await db.inventoryMovement.findMany({
      where: { productId: p.id },
      select: { id: true, movementType: true, quantityDelta: true, locationId: true },
    });
    assert.equal(movements.length, 2);
    assert.equal(movements.find((v) => v.movementType === 'OPENING_BALANCE')?.quantityDelta, 10);
    assert.equal(movements.find((v) => v.movementType === 'STOCK_IN')?.quantityDelta, 5);
    const balances = await db.inventoryBalance.findMany({
      where: { productId: p.id },
      include: { location: true },
    });
    assert.equal(
      balances.reduce((n, b) => n + b.quantityOnHand, 0),
      15,
    );
    assert.equal(
      balances.reduce((n, b) => n + b.quantityReserved, 0),
      0,
    );
    assert.ok(balances.every((b) => !b.location.isSystem));
    const asset = s.images.find((i) => i.clientImageId === s.selectedImageKey)?.asset;
    assert.ok(asset?.intakePrivate);
    assert.equal(asset.intakeProductId, p.id);
    const publicUrl = new URL(asset.url, 'http://127.0.0.1:58463');
    assert.equal(publicUrl.origin, 'http://127.0.0.1:58463');
    assert.ok(publicUrl.pathname.includes('/products/intake-'));
    const publicStatus = (await fetch(publicUrl)).status;
    assert.equal(publicStatus, 404);
    const result = {
      time: new Date().toISOString(),
      scope: 'read-only isolated Phase5 DB + unauthenticated local media request',
      nativeArtifact: capture.installedSha256,
      product: {
        id: p.id,
        status: p.status,
        totalQuantity: p.totalQuantity,
        availableQuantity: p.availableQuantity,
        soldQuantity: p.soldQuantity,
      },
      sessions,
      movements,
      balances: balances.map((b) => ({
        locationId: b.locationId,
        code: b.location.code,
        onHand: b.quantityOnHand,
        reserved: b.quantityReserved,
      })),
      privateSourcePublicStatus: publicStatus,
      exactlyOneProductAndEachStockOperation: true,
      passed: true,
    };
    fs.writeFileSync(path.join(out, 'stock-evidence.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
