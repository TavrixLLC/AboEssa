const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const sharp = require('sharp');
module.exports = async ({
  app,
  db,
  request,
  owner,
  ownerToken,
  customer,
  customerToken,
  category,
  checks,
  origin,
}) => {
  const ok = async (p, status = 201) => {
    const r = await p;
    assert.equal(r.status, status, JSON.stringify(r.body));
    return r.data;
  };
  const base = '/admin/product-intake',
    sessions = base + '/sessions';
  const create = () =>
    ok(
      request('POST', sessions, {
        clientDraftId: randomUUID(),
        submissionOperationKey: randomUUID(),
      }),
    );
  const read = (id) => ok(request('GET', `${sessions}/${id}`), 200);
  const patch = (s, body) =>
    ok(request('PATCH', `${sessions}/${s.id}`, { expectedRevision: s.revision, ...body }), 200);
  const submit = (s, revision = s.revision, key = s.submissionOperationKey) =>
    request('POST', `${sessions}/${s.id}/submit`, { expectedRevision: revision }, undefined, key);
  const w = await ok(
    request('POST', '/admin/warehouses', {
      code: 'P5-' + randomUUID().slice(0, 6),
      name: 'مخزن إدخال QA',
    }),
  );
  const a = await ok(
    request('POST', '/admin/warehouse-locations', {
      warehouseId: w.id,
      code: 'A-01',
      name: 'الرف الأول',
    }),
  );
  const b = await ok(
    request('POST', '/admin/warehouse-locations', {
      warehouseId: w.id,
      code: 'B-02',
      name: 'الرف الثاني',
    }),
  );
  const bytes = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: '#f5e6bd' },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="1600" height="1200"><rect x="300" y="150" width="1000" height="900" rx="30" fill="#1c5348"/><text x="480" y="440" font-size="100" fill="white">QA PRODUCT</text><text x="560" y="650" font-size="90" fill="white">400 ml</text></svg>',
        ),
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
  const upload = (s, id, content = bytes, token = ownerToken) => {
    const form = new FormData();
    form.set('clientImageId', id);
    form.set('file', new Blob([content], { type: 'image/jpeg' }), 'product.jpg');
    return request('POST', `${sessions}/${s.id}/image`, form, token);
  };
  let s = await create();
  const original = s;
  assert.equal(s.status, 'DRAFT');
  assert.ok(s.missingFields.includes('image'));
  await ok(
    request('POST', sessions, {
      clientDraftId: s.clientDraftId,
      submissionOperationKey: s.submissionOperationKey,
    }),
  );
  await ok(
    request('POST', sessions, {
      clientDraftId: s.clientDraftId,
      submissionOperationKey: randomUUID(),
    }),
    409,
  );
  await ok(request('GET', sessions, undefined, null), 401);
  await ok(request('GET', sessions, undefined, customerToken), 403);
  const other = await db.adminUser.create({
    data: {
      email: `p5-${randomUUID()}@example.test`,
      normalizedEmail: `p5-${randomUUID()}@example.test`,
      name: 'PHASE5 QA STAFF',
      passwordHash: 'not-a-login',
      role: 'VIEWER',
      permissions: [
        'product_intake.use',
        'products.upload_images',
        'products.create',
        'inventory.receive',
        'inventory.read',
      ],
    },
  });
  const otherToken = await app
    .get(require('../dist/src/auth/token.service').TokenService)
    .signAdminAccess(other);
  const wrongActorDraft = randomUUID();
  const wrongActor = await fetch(origin + '/api' + sessions, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${ownerToken}`,
      'X-Intake-Actor': other.id,
    },
    body: JSON.stringify({ clientDraftId: wrongActorDraft, submissionOperationKey: randomUUID() }),
  });
  assert.equal(wrongActor.status, 403);
  assert.equal(
    await db.productIntakeSession.count({ where: { clientDraftId: wrongActorDraft } }),
    0,
  );
  await ok(request('GET', `${sessions}/${s.id}`, undefined, otherToken), 404);
  await ok(
    request('PATCH', `${sessions}/${s.id}`, { expectedRevision: 0, quantity: 1 }, otherToken),
    404,
  );
  checks.push({
    check: 'Durable create replay/conflict; normal JWT/RBAC and cross-employee ownership enforced',
  });
  await ok(submit(s), 400);
  await ok(
    request('PATCH', `${sessions}/${s.id}`, { expectedRevision: s.revision, quantity: 0 }),
    400,
  );
  await ok(
    request('PATCH', `${sessions}/${s.id}`, {
      expectedRevision: s.revision,
      approvedMetadata: { price: '-1' },
    }),
    400,
  );
  await ok(
    request('PATCH', `${sessions}/${s.id}`, {
      expectedRevision: s.revision,
      approvedMetadata: { categoryId: 'missing' },
    }),
    400,
  );
  await ok(
    request('PATCH', `${sessions}/${s.id}`, {
      expectedRevision: s.revision,
      recognizedMetadata: { title: 'not approved' },
    }),
    400,
  );
  const imageId = randomUUID();
  s = await patch(s, {
    approvedMetadata: { title: 'شامبو QA', categoryId: category.id, price: '1000.00' },
    quantity: 10,
    locationId: a.id,
    selectedImageKey: imageId,
  });
  await ok(request('PATCH', `${sessions}/${s.id}`, { expectedRevision: 0, quantity: 2 }), 409);
  s = await ok(upload(s, imageId));
  s = await ok(upload(s, imageId));
  const asset = await db.fileAsset.findUniqueOrThrow({ where: { id: s.image.assetId } });
  assert.equal(asset.intakePrivate, true);
  assert.equal(asset.intakeProductId, null);
  const source = await app
      .get(require('../dist/src/files/storage-provider.interface').STORAGE_PROVIDER)
      .getObject(asset.key),
    parts = [];
  for await (const p of source.stream) parts.push(p);
  assert.equal(
    createHash('sha256').update(Buffer.concat(parts)).digest('hex'),
    createHash('sha256').update(bytes).digest('hex'),
  );
  await ok(request('GET', `/media/${asset.key}`, undefined, null), 404);
  const preview = await ok(request('GET', `${sessions}/${s.id}/preview`), 200);
  assert.equal(preview.clientImageId, imageId);
  assert.ok(Buffer.from(preview.dataBase64, 'base64').length < 150000);
  await ok(request('GET', `${sessions}/${s.id}/preview`, undefined, otherToken), 404);
  checks.push({
    check:
      'Fields/revisions/category/quantity validated; uploaded original preserved; draft original and private preview ownership protected',
  });
  const before = await db.productListing.count();
  const results = await Promise.all([submit(s), submit(s)]);
  assert.ok(
    results.every((r) => r.status === 201),
    JSON.stringify(results),
  );
  assert.equal(results[0].data.productId, results[1].data.productId);
  assert.equal(await db.productListing.count(), before + 1);
  const p = await db.productListing.findUniqueOrThrow({ where: { id: results[0].data.productId } });
  assert.equal(p.status, 'DRAFT');
  assert.equal(p.totalQuantity, 10);
  assert.equal(p.availableQuantity, 10);
  assert.ok(p.inventoryMappedAt);
  const balances = await db.inventoryBalance.findMany({ where: { productId: p.id } });
  assert.equal(balances.length, 1);
  assert.equal(balances[0].locationId, a.id);
  assert.equal(balances[0].quantityOnHand, 10);
  const movements = await db.inventoryMovement.findMany({ where: { productId: p.id } });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].movementType, 'OPENING_BALANCE');
  assert.equal(movements[0].quantityDelta, 10);
  await ok(submit(s, s.revision + 1), 409);
  await ok(submit(s, s.revision, randomUUID()), 409);
  const recovery = await ok(request('GET', `${base}/submissions/${s.submissionOperationKey}`), 200);
  assert.equal(recovery.state, 'COMPLETED');
  assert.equal(recovery.result.productId, p.id);
  await ok(request('POST', `${sessions}/${s.id}/cancel`, { expectedRevision: s.revision }), 409);
  await ok(request('GET', `/media/${asset.key}`, undefined, null), 404);
  checks.push({
    check:
      'Atomic initial stock exactly 10, one DRAFT product, one selected physical opening, concurrent duplicate submission/recovery/conflicting payload guards',
    productId: p.id,
  });
  // Wait for the actual Phase 2 BullMQ worker, not a mocked optimization job.
  const deadline = Date.now() + 20000;
  let job;
  while (Date.now() < deadline) {
    job = await db.fileAssetImageJob.findUnique({
      where: { assetId_recipeVersion: { assetId: asset.id, recipeVersion: 'v1' } },
    });
    if (job?.status === 'COMPLETED') break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(job?.status, 'COMPLETED');
  assert.equal(await db.fileAssetVariant.count({ where: { assetId: asset.id } }), 8);
  const variant = await db.fileAssetVariant.findFirstOrThrow({
    where: { assetId: asset.id, variantType: 'CATALOG', format: 'WEBP' },
  });
  const variantPath = '/media/catalog-variants/v/' + variant.storageKey.split('/')[1];
  await ok(request('GET', variantPath, undefined, null), 404);
  await ok(request('POST', `/admin/products/${p.id}/publish`, {}));
  const publicOriginal = await fetch(origin + '/api/media/' + asset.key);
  assert.equal(publicOriginal.status, 200);
  const publicVariant = await fetch(origin + '/api' + variantPath);
  assert.equal(publicVariant.status, 200);
  assert.match(publicVariant.headers.get('cache-control'), /immutable/);
  const publicCatalog = await ok(request('GET', `/products/${p.id}`, undefined, null), 200);
  assert.equal(publicCatalog.imageUrls[0], asset.url);
  checks.push({
    check:
      'Real BullMQ optimization produces eight variants once; original/hashed variants stay private until explicit publication, then legacy public catalog works',
  });
  let stock = await create();
  const stockImage = randomUUID();
  stock = await patch(stock, {
    mode: 'STOCK_IN',
    existingProductId: p.id,
    quantity: 5,
    locationId: b.id,
    selectedImageKey: stockImage,
  });
  stock = await ok(upload(stock, stockImage));
  const count = await db.productListing.count();
  const receipt = await ok(submit(stock));
  await ok(submit(stock));
  assert.equal(await db.productListing.count(), count);
  assert.equal(
    (await db.productListing.findUniqueOrThrow({ where: { id: p.id } })).availableQuantity,
    15,
  );
  const recoveredReceipt = await ok(
    request('GET', `${base}/submissions/${stock.submissionOperationKey}`),
    200,
  );
  assert.equal(recoveredReceipt.result.productId, p.id);
  checks.push({
    check:
      'Existing-product receipt uses Phase 4 exactly once; no duplicate product, selected second location and durable response-loss recovery',
    productId: receipt.productId,
  });
  // Change location availability after draft validation: the entire commit rolls back.
  let invalid = await create();
  const invalidImage = randomUUID();
  invalid = await patch(invalid, {
    approvedMetadata: { title: 'ROLLBACK QA', categoryId: category.id, price: '500' },
    quantity: 3,
    locationId: b.id,
    selectedImageKey: invalidImage,
  });
  invalid = await ok(upload(invalid, invalidImage));
  const empty = await ok(
    request('POST', '/admin/warehouse-locations', {
      warehouseId: w.id,
      code: 'EMPTY',
      name: 'QA disabled target',
    }),
  );
  invalid = await patch(invalid, { locationId: empty.id });
  await ok(request('PATCH', `/admin/warehouse-locations/${empty.id}`, { isActive: false }), 200);
  const counts = await Promise.all([
    db.productListing.count(),
    db.inventoryMovement.count(),
    db.inventoryOperation.count(),
  ]);
  await ok(submit(invalid), 409);
  assert.deepEqual(
    await Promise.all([
      db.productListing.count(),
      db.inventoryMovement.count(),
      db.inventoryOperation.count(),
    ]),
    counts,
  );
  assert.equal((await read(invalid.id)).status, 'DRAFT');
  checks.push({
    check:
      'Invalidated location abort rolls back product, initial balance, movements, submission operation and draft completion together',
  });
  // Retake ID correlations: finishing the old upload never replaces the selection.
  let retake = await create();
  const oldImage = randomUUID(),
    newImage = randomUUID();
  retake = await patch(retake, { selectedImageKey: oldImage });
  retake = await patch(retake, { selectedImageKey: newImage });
  await ok(upload(retake, oldImage));
  assert.equal((await read(retake.id)).image, null);
  retake = await ok(upload(retake, newImage));
  assert.equal(retake.image.clientImageId, newImage);
  const changedBytes = await sharp({
    create: { width: 100, height: 100, channels: 3, background: '#ff0000' },
  })
    .jpeg()
    .toBuffer();
  await ok(upload(retake, newImage, changedBytes), 409);
  await ok(
    request('POST', `${sessions}/${retake.id}/cancel`, { expectedRevision: retake.revision }),
  );
  assert.equal((await read(retake.id)).status, 'CANCELLED');
  assert.ok(await db.fileAsset.findUnique({ where: { id: retake.image.assetId } }));
  assert.equal(await db.fileAssetVariant.count({ where: { assetId: asset.id } }), 8);
  checks.push({
    check:
      'Multiple immutable image IDs isolate delayed retakes; conflicting upload bytes rejected; cancellation preserves referenced originals/variants',
  });
  // Inject one QA storage failure before any object write, then retry the SAME
  // immutable image identity/content. This is an actual HTTP upload, not a mock API.
  let retry = await create();
  const retryImage = randomUUID();
  retry = await patch(retry, {
    selectedImageKey: retryImage,
    approvedMetadata: { title: 'Retry source QA' },
  });
  const storage = app.get(require('../dist/src/files/storage-provider.interface').STORAGE_PROVIDER),
    put = storage.putObject;
  let failOnce = true;
  storage.putObject = async function (input) {
    if (failOnce && input.key.startsWith('products/intake-')) {
      failOnce = false;
      throw Error('QA transient storage failure');
    }
    return put.call(this, input);
  };
  try {
    await ok(upload(retry, retryImage), 500);
  } finally {
    storage.putObject = put;
  }
  assert.equal((await read(retry.id)).image.uploadStatus, 'FAILED');
  retry = await ok(upload(retry, retryImage));
  assert.equal(retry.image.uploadStatus, 'READY');
  assert.equal(retry.approvedMetadata.title, 'Retry source QA');
  const jobWhere = { assetId_recipeVersion: { assetId: retry.image.assetId, recipeVersion: 'v1' } };
  async function waitJob() {
    const end = Date.now() + 20000;
    let j;
    while (Date.now() < end) {
      j = await db.fileAssetImageJob.findUnique({ where: jobWhere });
      if (j?.status === 'COMPLETED') return j;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.fail('Real image worker did not complete retry');
  }
  await waitJob();
  await db.fileAssetImageJob.update({
    where: jobWhere,
    data: { status: 'FAILED', errorCode: 'QA_INJECTED_FAILURE', attempts: 5 },
  });
  await ok(request('POST', `${sessions}/${retry.id}/retry-media`, {}));
  await waitJob();
  assert.equal(await db.fileAssetVariant.count({ where: { assetId: retry.image.assetId } }), 8);
  assert.ok(await db.fileAsset.findUnique({ where: { id: retry.image.assetId } }));
  checks.push({
    check:
      'Transient storage upload failure retries the same image safely; metadata/source survive; failed Phase2 job retry completes with eight, not duplicate, variants',
  });
  // Independent receipts against one product exercise product locks and durable
  // operations through the intake path, not only duplicate-key replay.
  const receipts = [];
  for (let i = 0; i < 2; i++) {
    let d = await create();
    const img = randomUUID();
    d = await patch(d, {
      mode: 'STOCK_IN',
      existingProductId: p.id,
      quantity: 2,
      locationId: a.id,
      selectedImageKey: img,
    });
    d = await ok(upload(d, img));
    receipts.push(d);
  }
  const concurrent = await Promise.all(receipts.map((d) => submit(d)));
  assert.ok(
    concurrent.every((r) => r.status === 201),
    JSON.stringify(concurrent),
  );
  assert.equal(
    (await db.productListing.findUniqueOrThrow({ where: { id: p.id } })).availableQuantity,
    19,
  );
  assert.equal(await db.productListing.count({ where: { id: p.id } }), 1);
  checks.push({
    check:
      'Two different concurrent intake stock receipts each commit once: existing availability 15 → 19, no lost update or duplicate product',
  });
  await ok(request('POST', `/admin/products/${p.id}/cancel`, {}));
  await ok(request('GET', `/media/${asset.key}`, undefined, null), 404);
  await ok(request('GET', variantPath, undefined, null), 404);
  checks.push({
    check:
      'Cancelling a previously published intake listing revokes original and immutable-variant access without deleting the source',
  });
  const config = app.get(require('@nestjs/config').ConfigService);
  config.set('intake.enabled', false);
  await ok(request('GET', sessions), 404);
  config.set('intake.enabled', true);
  const page = await ok(request('GET', sessions + '?limit=2'), 200);
  assert.equal(page.items.length, 2);
  assert.equal(page.meta.hasMore, true);
  checks.push({
    check:
      'Disabled flag hides intake only; draft listing is bounded and public customers cannot see unfinished sessions',
  });
};
