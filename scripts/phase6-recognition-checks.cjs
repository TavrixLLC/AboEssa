const assert = require('node:assert/strict'),
  { randomUUID, createHash } = require('node:crypto'),
  sharp = require('sharp');
module.exports = async ({
  app,
  db,
  request,
  owner,
  ownerToken,
  customerToken,
  category,
  checks,
}) => {
  const { MockRecognitionProvider } = require('../dist/src/ai/recognition.provider');
  const { RecognitionService } = require('../dist/src/ai/recognition.service');
  const mock = app.get(MockRecognitionProvider),
    service = app.get(RecognitionService);
  const manualTitle = 'اسم الموظف 400 ml QA ' + randomUUID();
  const base = '/admin/product-intake/sessions';
  const ok = async (p, status = 201) => {
    const r = await p;
    assert.equal(r.status, status, JSON.stringify(r.body));
    return r.data;
  };
  const create = (token = ownerToken) =>
    ok(
      request(
        'POST',
        base,
        { clientDraftId: randomUUID(), submissionOperationKey: randomUUID() },
        token,
      ),
    );
  const read = (id) => ok(request('GET', `${base}/${id}`), 200);
  const patch = (s, body) =>
    ok(request('PATCH', `${base}/${s.id}`, { expectedRevision: s.revision, ...body }), 200);
  const analyze = (s, key = randomUUID(), extra = {}) =>
    request('POST', `${base}/${s.id}/recognition`, {
      clientImageId: s.selectedImageKey,
      requestKey: key,
      ...extra,
    });
  const status = (s) => ok(request('GET', `${base}/${s.id}/recognition`), 200);
  const wait = async (s, expected = 'COMPLETED') => {
    const limit = Date.now() + 25000;
    while (Date.now() < limit) {
      const r = await status(s);
      if (r.state === expected) return r;
      if (['FAILED', 'UNKNOWN'].includes(r.state) && r.state !== expected)
        throw Error(JSON.stringify(r));
      await new Promise((r) => setTimeout(r, 150));
    }
    throw Error('Recognition wait expired');
  };
  const bytes = async (color) =>
    sharp({ create: { width: 1800, height: 1300, channels: 3, background: color } })
      .jpeg({ quality: 90 })
      .toBuffer();
  const fixture = (name = 'شامبو دوف 400 ml') => ({
    name_ar: name,
    name_en: 'Dove Shampoo 400 ml',
    description_ar: 'عبوة شامبو دوف بحجم 400 مل',
    brand: 'Dove',
    product_type: 'شامبو',
    category_id: category.id,
    size_value: 400,
    size_unit: 'ml',
    color: null,
    model_number: null,
    manufacturer: null,
    barcode_text: null,
    visible_attributes: [{ name: 'packaging', value: 'bottle' }],
    uncertain_fields: [],
    needs_review: false,
  });
  const upload = async (s, content, output = fixture()) => {
    const imageId = randomUUID();
    s = await patch(s, { selectedImageKey: imageId });
    const form = new FormData();
    form.set('clientImageId', imageId);
    form.set('file', new Blob([content], { type: 'image/jpeg' }), 'qa.jpg');
    const hash = createHash('sha256').update('image/jpeg').update(content).digest('hex');
    mock.fixtures.set(hash, output);
    s = await ok(request('POST', `${base}/${s.id}/image`, form));
    return { s, hash };
  };
  const submit = (s, token = ownerToken) =>
    request(
      'POST',
      `${base}/${s.id}/submit`,
      { expectedRevision: s.revision },
      token,
      s.submissionOperationKey,
    );
  const approve = (s, ai, fields = ['title', 'description', 'categoryId'], replace = false) =>
    request('POST', `${base}/${s.id}/recognition/approve`, {
      requestId: ai.id,
      expectedRevision: s.revision,
      clientImageId: s.selectedImageKey,
      fields,
      replace,
    });
  const warehouse = await ok(
    request('POST', '/admin/warehouses', {
      code: 'P6-' + randomUUID().slice(0, 6),
      name: 'Phase6 QA warehouse',
    }),
  );
  const location = await ok(
    request('POST', '/admin/warehouse-locations', {
      warehouseId: warehouse.id,
      code: 'A-01',
      name: 'Phase6 QA A01',
    }),
  );
  const second = await ok(
    request('POST', '/admin/warehouse-locations', {
      warehouseId: warehouse.id,
      code: 'B-02',
      name: 'Phase6 QA B02',
    }),
  );
  let s = await create();
  const content = await bytes('#156354');
  ({ s } = await upload(s, content));
  await ok(request('GET', `${base}/${s.id}/recognition`, undefined, null), 401);
  await ok(request('GET', `${base}/${s.id}/recognition`, undefined, customerToken), 403);
  await ok(analyze(s, randomUUID(), { imageUrl: 'http://127.0.0.1/private' }), 400);
  const other = await db.adminUser.create({
    data: {
      email: `p6-${randomUUID()}@example.test`,
      normalizedEmail: `p6-${randomUUID()}@example.test`,
      name: 'PHASE6 QA EMPLOYEE',
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
  await ok(request('GET', `${base}/${s.id}/recognition`, undefined, otherToken), 404);
  await ok(
    request(
      'POST',
      `${base}/${s.id}/recognition`,
      { clientImageId: s.selectedImageKey, requestKey: randomUUID() },
      otherToken,
    ),
    404,
  );
  checks.push('JWT/admin/owner isolation and external URL whitelist rejection');
  const key = randomUUID(),
    beforeCalls = mock.calls;
  await Promise.all([ok(analyze(s, key)), ok(analyze(s, key))]);
  const ai = await wait(s);
  assert.equal(ai.provider, 'mock');
  assert.ok(ai.warnings.includes('MOCK_NOT_PHOTO_RECOGNITION'));
  for (let i = 0; i < 5; i++) await status(s);
  assert.equal(mock.calls, beforeCalls + 1);
  s = await read(s.id);
  assert.deepEqual(s.approvedMetadata, {});
  assert.equal(s.quantity, null);
  checks.push(
    'Real BullMQ executes one mock computation; status/repeated POST do not repeat inference or auto-approve',
  );
  const config = app.get(require('@nestjs/config').ConfigService);
  config.set('AI_MODEL_REVISION', 'mock-context-changed');
  assert.equal((await status(s)).state, 'STALE_CONFIG');
  await ok(approve(s, ai), 409);
  config.set('AI_MODEL_REVISION', 'mock-v1');
  assert.equal((await status(s)).state, 'COMPLETED');
  assert.equal(mock.calls, beforeCalls + 1);
  checks.push(
    'Model/prompt/schema/image-recipe context is revalidated before delivery/approval without another model call',
  );
  s = await patch(s, {
    approvedMetadata: { title: manualTitle, price: '1000' },
    quantity: 10,
    locationId: location.id,
  });
  const accepted = await ok(approve(s, ai));
  assert.ok(accepted.skipped.includes('title'));
  s = await read(s.id);
  assert.equal(s.approvedMetadata.title, manualTitle);
  assert.equal(s.approvedMetadata.price, '1000');
  assert.equal(s.quantity, 10);
  assert.equal(s.locationId, location.id);
  await ok(approve({ ...s, revision: s.revision - 1 }, ai), 409);
  await ok(
    request('POST', `${base}/${s.id}/recognition/approve`, {
      requestId: ai.id,
      expectedRevision: s.revision,
      clientImageId: s.selectedImageKey,
      fields: ['price'],
    }),
    400,
  );
  checks.push(
    'Empty-field explicit approval preserves employee title, price, quantity and location; stale revision and forbidden fields rejected',
  );
  const saved = await ok(submit(s));
  await ok(submit(s));
  let product = await db.productListing.findUniqueOrThrow({ where: { id: saved.productId } });
  assert.equal(product.totalQuantity, 10);
  assert.equal(
    await db.inventoryMovement.count({
      where: { productId: product.id, movementType: 'OPENING_BALANCE' },
    }),
    1,
  );
  checks.push(
    'New approved product + physical opening stock commit atomically exactly once (replayed same operation)',
  );
  let duplicate = await create();
  ({ s: duplicate } = await upload(duplicate, content));
  await ok(analyze(duplicate));
  await wait(duplicate);
  assert.equal(mock.calls, beforeCalls + 1);
  duplicate = await patch(duplicate, {
    approvedMetadata: { title: product.title, price: '1000', categoryId: category.id },
    quantity: 5,
    locationId: second.id,
  });
  let review = await ok(request('GET', `${base}/${duplicate.id}/duplicates`), 200);
  assert.equal(review.needsReview, true);
  assert.equal(review.candidates[0].id, product.id);
  const count = await db.productListing.count();
  await ok(submit(duplicate), 409);
  assert.equal(await db.productListing.count(), count);
  await ok(
    request('POST', `${base}/${duplicate.id}/duplicates/distinct`, {
      expectedRevision: duplicate.revision,
      candidatesHash: review.candidatesHash,
      reason: 'QA reviewed different packaging',
    }),
  );
  duplicate = await patch(duplicate, { approvedMetadata: { price: '1100' } });
  await ok(submit(duplicate), 409);
  checks.push(
    'Cached computation with separate session; fresh NEW duplicate guard prevents stock; decision invalidated by draft revision',
  );
  // Existing selection keeps catalog/image untouched and reuses the Phase 4 receipt.
  duplicate = await patch(duplicate, {
    mode: 'STOCK_IN',
    existingProductId: product.id,
    locationId: second.id,
  });
  const received = await ok(submit(duplicate));
  await ok(submit(duplicate));
  assert.equal(received.productId, product.id);
  product = await db.productListing.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(product.totalQuantity, 15);
  assert.equal(await db.productListing.count(), count);
  assert.equal(product.title, manualTitle);
  assert.equal(
    await db.inventoryMovement.count({
      where: { productId: product.id, movementType: 'STOCK_IN' },
    }),
    1,
  );
  checks.push(
    'Existing-product +5 receipt exactly once: 10 to 15, no new listing or original metadata/image overwrite',
  );
  // Same exact pixels across employees shares only computation; private drafts/status stay isolated.
  const another = await create(otherToken),
    imageId = randomUUID();
  await ok(
    request(
      'PATCH',
      `${base}/${another.id}`,
      { expectedRevision: another.revision, selectedImageKey: imageId },
      otherToken,
    ),
    200,
  );
  const form = new FormData();
  form.set('clientImageId', imageId);
  form.set('file', new Blob([content], { type: 'image/jpeg' }), 'same.jpg');
  await ok(request('POST', `${base}/${another.id}/image`, form, otherToken));
  const linked = await ok(
    request(
      'POST',
      `${base}/${another.id}/recognition`,
      { clientImageId: imageId, requestKey: randomUUID() },
      otherToken,
    ),
  );
  assert.equal(linked.state, 'COMPLETED');
  assert.equal(linked.cacheShared, true);
  assert.equal(mock.calls, beforeCalls + 1);
  await ok(request('GET', `${base}/${another.id}/recognition`, undefined, ownerToken), 200); // owner manage_all explicitly permitted
  await ok(request('GET', `${base}/${s.id}/recognition`, undefined, otherToken), 404);
  checks.push(
    "Two employees reuse safe computation but cannot inspect one another's drafts (owner manage_all remains explicit)",
  );
  let retake = await create();
  ({ s: retake } = await upload(retake, await bytes('#996655')));
  const originalRecognize = mock.recognize.bind(mock);
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const oldHash = (
    await db.productIntakeImage.findFirstOrThrow({ where: { sessionId: retake.id } })
  ).requestHash;
  mock.recognize = async (input) => {
    if (input.sourceHash === oldHash) await gate;
    return originalRecognize(input);
  };
  await ok(analyze(retake));
  const oldAi = await wait(retake, 'PROCESSING');
  ({ s: retake } = await upload(retake, await bytes('#553399'), fixture('بلسم جديد 500 ml')));
  retake = await patch(retake, {
    approvedMetadata: { title: 'كتابة يدوية أثناء التحليل', price: '1200' },
  });
  await ok(analyze(retake));
  release();
  const latest = await wait(retake);
  mock.recognize = originalRecognize;
  assert.notEqual(latest.id, oldAi.id);
  await ok(approve(retake, oldAi), 409);
  retake = await read(retake.id);
  assert.equal(retake.approvedMetadata.title, 'كتابة يدوية أثناء التحليل');
  assert.equal(retake.approvedMetadata.price, '1200');
  checks.push('Retake during processing fences old result; manual fields survive late completion');
  // Schema failure still permits the normal/manual transaction.
  let failed = await create();
  ({ s: failed } = await upload(failed, await bytes('#aa2222'), { ...fixture(), price: 999 }));
  await ok(analyze(failed));
  const failure = await wait(failed, 'FAILED');
  assert.equal(failure.errorCode, 'AI_INVALID_SCHEMA');
  failed = await patch(failed, {
    approvedMetadata: {
      title: 'منتج إدخال يدوي ' + randomUUID(),
      price: '1500',
      categoryId: category.id,
    },
    quantity: 1,
    locationId: location.id,
  });
  await ok(submit(failed));
  checks.push(
    'Invalid AI financial field rejected; manual fallback still creates one product/receipt',
  );
  let cancelled = await create();
  ({ s: cancelled } = await upload(cancelled, await bytes('#33aaaa')));
  const pending = await ok(analyze(cancelled));
  await ok(
    request('POST', `${base}/${cancelled.id}/recognition/cancel`, { requestId: pending.id }),
  );
  assert.equal((await status(cancelled)).state, 'CANCELLED');
  await ok(approve(cancelled, pending), 409);
  checks.push('Cancellation never approves suggestions or submits stock');
  // Stale taxonomy is rejected even after a cached result.
  const change = await db.category.create({
    data: { name: 'Phase6 taxonomy revision', slug: 'p6-tax-' + randomUUID() },
  });
  assert.equal((await status(retake)).state, 'STALE_TAXONOMY');
  await ok(approve(retake, latest), 409);
  checks.push('Active taxonomy change invalidates result reuse and approval');
  // Fresh candidate appeared after review -> prior distinct decision must not bypass the commit check.
  let fresh = await create();
  ({ s: fresh } = await upload(fresh, await bytes('#eebb11')));
  const title = 'جهاز فريد QA ' + randomUUID();
  fresh = await patch(fresh, {
    approvedMetadata: { title, price: '1000', categoryId: change.id },
    quantity: 1,
    locationId: location.id,
  });
  review = await ok(request('GET', `${base}/${fresh.id}/duplicates`), 200);
  await ok(
    request('POST', `${base}/${fresh.id}/duplicates/distinct`, {
      expectedRevision: fresh.revision,
      candidatesHash: review.candidatesHash,
      reason: 'QA no known candidate at review time',
    }),
  );
  await ok(
    request('POST', '/admin/products', { title, price: 1000, quantity: 1, categoryId: change.id }),
  );
  await ok(submit(fresh), 409);
  review = await ok(request('GET', `${base}/${fresh.id}/duplicates`), 200);
  await ok(
    request('POST', `${base}/${fresh.id}/duplicates/distinct`, {
      expectedRevision: fresh.revision,
      candidatesHash: review.candidatesHash,
      reason: 'QA explicitly reviewed distinct batch',
    }),
  );
  await ok(submit(fresh));
  checks.push(
    'Candidate appearing after review requires another explicit decision; current distinct override audited and commits normally',
  );
  // Durable PENDING outbox recovered after dispatcher/worker restart; no API re-analysis.
  const runtime = app.get(require('../dist/src/ai/recognition.runtime').RecognitionRuntime);
  await runtime.onApplicationShutdown();
  let restart = await create();
  ({ s: restart } = await upload(restart, await bytes('#001122')));
  await ok(analyze(restart));
  assert.equal((await status(restart)).state, 'PENDING');
  runtime.onApplicationBootstrap();
  await wait(restart);
  checks.push(
    'Stopped BullMQ worker/dispatcher + pending DB outbox resumes after runtime restart without resubmitting request',
  );
  // Crash-after-dispatch cannot safely be re-billed: recover as UNKNOWN with full reservation.
  const task = await db.productRecognitionTask.findFirstOrThrow({
    where: { requests: { some: { sessionId: restart.id } } },
  });
  const calls = mock.calls;
  await db.productRecognitionTask.update({
    where: { id: task.id },
    data: {
      status: 'PROCESSING',
      leaseToken: 'expired-qa',
      nextDispatchAt: new Date(Date.now() - 1000),
    },
  });
  await service.process(task.id);
  assert.equal((await status(restart)).state, 'UNKNOWN');
  assert.equal(mock.calls, calls);
  checks.push('Ambiguous in-flight restart becomes UNKNOWN; no automatic second provider call');
  const usage = await ok(request('GET', '/admin/product-intake/recognition-usage'), 200);
  assert.equal(usage.actualBilling, 'NOT_AVAILABLE');
  assert.equal(usage.automaticFallback, false);
  assert.equal(await db.recognitionUsage.count({ where: { actualBilledUsd: { not: null } } }), 0);
  checks.push(
    'Read-only bounded usage summary exposes estimates/unknowns, not credentials or fictitious invoice charges',
  );
  assert.ok(await db.auditLog.count({ where: { action: 'product_intake.ai_approved' } }));
  assert.ok(await db.auditLog.count({ where: { action: 'product_intake.distinct_product' } }));
  checks.push('Employee approval and distinct-product decisions leave audit evidence');
  const retryKey = randomUUID();
  await ok(analyze(restart, retryKey, { reanalyze: true }));
  await wait(restart);
  const afterRetry = mock.calls;
  await ok(analyze(restart, retryKey, { reanalyze: true }));
  assert.equal(mock.calls, afterRetry);
  await ok(analyze(restart, randomUUID(), { reanalyze: true }));
  await wait(restart);
  await ok(analyze(restart, randomUUID(), { reanalyze: true }), 409);
  checks.push(
    'Explicit re-analysis capped at two; lost/repeated request key does not create another attempt',
  );
  // Two employees commit the same normalized identity concurrently. This exercises
  // the existing serializable retry + fresh guard, not a new unique title constraint.
  const raceTitle = 'منتج سباق Phase6 ' + randomUUID();
  let first = await create();
  ({ s: first } = await upload(first, await bytes('#112244')));
  first = await patch(first, {
    approvedMetadata: { title: raceTitle, price: '1000', categoryId: change.id },
    quantity: 2,
    locationId: location.id,
  });
  let secondDraft = await create(otherToken);
  const raceImage = randomUUID();
  secondDraft = await ok(
    request(
      'PATCH',
      `${base}/${secondDraft.id}`,
      {
        expectedRevision: secondDraft.revision,
        selectedImageKey: raceImage,
        approvedMetadata: { title: raceTitle, price: '1000', categoryId: change.id },
        quantity: 3,
        locationId: second.id,
      },
      otherToken,
    ),
    200,
  );
  const raceForm = new FormData();
  raceForm.set('clientImageId', raceImage);
  raceForm.set('file', new Blob([await bytes('#224466')], { type: 'image/jpeg' }), 'race.jpg');
  secondDraft = await ok(request('POST', `${base}/${secondDraft.id}/image`, raceForm, otherToken));
  const race = await Promise.all([submit(first), submit(secondDraft, otherToken)]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  const raceProducts = await db.productListing.findMany({ where: { title: raceTitle } });
  assert.equal(raceProducts.length, 1);
  assert.ok([2, 3].includes(raceProducts[0].totalQuantity));
  checks.push(
    'Two actual employee tokens concurrently submit identical title: one commit, one fresh duplicate review, no second opening (specific tested race, not universal uniqueness guarantee)',
  );
};
