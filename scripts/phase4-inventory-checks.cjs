const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
module.exports = async ({
  app,
  db,
  request,
  customerToken,
  customer,
  admin,
  category,
  delivery,
  checks,
}) => {
  const ok = async (p, status = 201) => {
    const r = await p;
    assert.equal(r.status, status, JSON.stringify(r.body));
    return r.data;
  };
  const read = (id) => ok(request('GET', `/admin/products/${id}/inventory`), 200);
  const create = async (q = 20, status = 'ACTIVE') => {
    const p = await ok(
      request('POST', '/admin/products', {
        title: 'إِلِكتروني Phase4 ' + randomUUID(),
        price: 1000,
        quantity: q,
        categoryId: category.id,
      }),
    );
    if (status === 'ACTIVE') await ok(request('POST', `/admin/products/${p.id}/publish`, {}));
    return p;
  };
  const map = async (id) =>
    ok(request('POST', '/admin/inventory/backfill', { dryRun: false, productId: id }));
  const receipt = (id, locationId, quantity, key = randomUUID()) =>
    request(
      'POST',
      `/admin/products/${id}/inventory/stock-in`,
      { locationId, quantity },
      undefined,
      key,
    );
  const transfer = (
    productId,
    sourceLocationId,
    destinationLocationId,
    quantity,
    key = randomUUID(),
  ) =>
    request(
      'POST',
      '/admin/inventory/transfers',
      { productId, sourceLocationId, destinationLocationId, quantity },
      undefined,
      key,
    );
  const buy = (
    id,
    quantity,
    method = 'CASH_ON_DELIVERY',
    key = randomUUID(),
    token = customerToken,
  ) =>
    request(
      'POST',
      `/products/${id}/buy`,
      { quantity, paymentMethod: method, delivery },
      token,
      key,
    );
  const action = (id, action, extra = {}) =>
    request('POST', `/admin/orders/${id}/actions`, {
      action,
      reason: 'Phase4 QA cancellation',
      ...extra,
    });
  const w = await ok(
    request('POST', '/admin/warehouses', {
      code: ' main-' + randomUUID().slice(0, 6) + ' ',
      name: 'المخزن الرئيسي',
    }),
  );
  assert.equal(w.code, w.code.trim().toUpperCase());
  await ok(
    request('POST', '/admin/warehouses', { code: w.code.toLowerCase(), name: 'duplicate' }),
    409,
  );
  const loc = async (code) =>
    ok(
      request('POST', '/admin/warehouse-locations', {
        warehouseId: w.id,
        code,
        name: 'الموقع ' + code,
      }),
    );
  const a = await loc('A-01'),
    b = await loc('B-02'),
    empty = await loc('C-03');
  await ok(
    request('POST', '/admin/warehouse-locations', {
      warehouseId: w.id,
      code: ' a-01 ',
      name: 'duplicate',
    }),
    409,
  );
  await ok(request('PATCH', `/admin/warehouse-locations/${empty.id}`, { isActive: false }), 200);
  checks.push({
    check: 'Warehouse/location create, normalized duplicate rejection and empty deactivation',
  });
  const p = await create();
  const dry = await ok(request('POST', '/admin/inventory/backfill', { productId: p.id }));
  assert.equal(dry.dryRun, true);
  assert.equal((await read(p.id)).reconciliation.state, 'MIGRATION_PENDING');
  await map(p.id);
  let state = await read(p.id);
  const legacy = state.balances[0].locationId;
  assert.equal(state.reconciliation.state, 'UNALLOCATED');
  assert.equal(state.totals.quantityOnHand, 20);
  const movementCount = await db.inventoryMovement.count({ where: { productId: p.id } });
  await map(p.id);
  assert.equal(await db.inventoryMovement.count({ where: { productId: p.id } }), movementCount);
  await ok(transfer(p.id, legacy, a.id, 10));
  assert.equal((await read(p.id)).product.availableQuantity, 20);
  await ok(receipt(p.id, legacy, 1), 409);
  const key = randomUUID();
  await ok(receipt(p.id, a.id, 10, key));
  await ok(receipt(p.id, a.id, 10, key));
  assert.equal((await read(p.id)).product.availableQuantity, 30);
  await ok(receipt(p.id, a.id, 11, key), 409);
  await ok(receipt(p.id, a.id, 5));
  await Promise.all([ok(receipt(p.id, a.id, 3)), ok(receipt(p.id, b.id, 7))]);
  state = await read(p.id);
  assert.equal(state.product.availableQuantity, 45);
  assert.equal(state.totals.quantityOnHand, 45);
  await ok(receipt(p.id, a.id, 0), 400);
  await ok(receipt(p.id, a.id, -1), 400);
  await ok(receipt(p.id, 'not-found', 1), 404);
  await ok(receipt(p.id, empty.id, 1), 409);
  checks.push({
    check:
      'Dry-run/backfill/restart replay, unallocated allocation, add 10 +5 + concurrent 3/7, immutable totals 45, receipt replay/conflict/validation',
  });
  const tk = randomUUID();
  const t = await ok(transfer(p.id, a.id, b.id, 5, tk));
  await ok(transfer(p.id, a.id, b.id, 5, tk));
  const paired = await db.inventoryMovement.findMany({ where: { operationId: t.transferId } });
  assert.equal(paired.length, 2);
  assert.equal(
    paired.reduce((n, r) => n + r.quantityDelta, 0),
    0,
  );
  const from = (await read(p.id)).balances.find((r) => r.locationId === a.id).quantityOnHand;
  const races = await Promise.all([
    transfer(p.id, a.id, b.id, from),
    transfer(p.id, a.id, b.id, from),
  ]);
  assert.deepEqual(races.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await read(p.id)).product.availableQuantity, 45);
  await ok(request('PATCH', `/admin/warehouse-locations/${b.id}`, { isActive: false }), 409);
  await ok(request('PATCH', `/admin/warehouses/${w.id}`, { isActive: false }), 409);
  await ok(request('DELETE', `/admin/warehouse-locations/${b.id}`), 404);
  checks.push({
    check:
      'Atomic paired transfer/replay, concurrent source exhaustion, nonempty location/warehouse protection',
  });
  const adjust = (delta, reason = 'QA count correction') =>
    request(
      'POST',
      `/admin/products/${p.id}/inventory/adjust`,
      { locationId: b.id, quantityDelta: delta, reason },
      undefined,
      randomUUID(),
    );
  await ok(adjust(2));
  await ok(adjust(-1));
  await ok(adjust(0), 400);
  await ok(adjust(-99999), 409);
  await ok(adjust(1, ''), 400);
  assert.equal((await read(p.id)).reconciliation.state, 'UNALLOCATED');
  await ok(request('PATCH', `/admin/products/${p.id}`, { quantity: 2 }), 409);
  await ok(request('PATCH', `/admin/products/${p.id}`, { title: 'Updated inventory name' }), 200);
  checks.push({
    check:
      'Reasoned positive/negative adjustment, no zero/negative balance or unaudited total replacement',
  });
  const zero = await db.productListing.create({
    data: {
      title: 'Phase4 zero disabled',
      categoryId: category.id,
      createdByAdminId: admin.id,
      price: 1000,
      totalQuantity: 0,
      availableQuantity: 0,
      soldQuantity: 0,
      status: 'CANCELLED',
    },
  });
  await ok(
    request(
      'POST',
      `/admin/products/${zero.id}/inventory/stock-in`,
      { quantity: 5 },
      undefined,
      randomUUID(),
    ),
    400,
  );
  await ok(receipt(zero.id, b.id, 5));
  state = await read(zero.id);
  assert.equal(state.product.availableQuantity, 5);
  assert.equal(state.product.status, 'CANCELLED');
  assert.equal(state.balances.find((x) => x.quantityOnHand === 5).locationId, b.id);
  const draft = await create(2, 'DRAFT');
  await map(draft.id);
  await ok(receipt(draft.id, a.id, 1));
  assert.equal((await read(draft.id)).product.status, 'DRAFT');
  checks.push({
    check:
      'Zero stock requires explicit physical selection; disabled/draft products are not automatically republished',
  });
  const saleProduct = await create();
  const beforeMapping = await ok(buy(saleProduct.id, 4));
  await map(saleProduct.id);
  state = await read(saleProduct.id);
  assert.equal(state.totals.quantityOnHand, 20);
  assert.equal(state.totals.quantityReserved, 4);
  assert.equal(state.product.availableQuantity, 16);
  await ok(action(beforeMapping.orderId, 'CANCEL'));
  await ok(action(beforeMapping.orderId, 'CANCEL'));
  state = await read(saleProduct.id);
  assert.equal(state.totals.quantityReserved, 0);
  assert.equal(state.product.availableQuantity, 20);
  const source = state.balances.find((x) => x.location.isSystem).locationId;
  await ok(transfer(saleProduct.id, source, a.id, 20));
  const walletBefore = await db.customerWallet.findUniqueOrThrow({
    where: { customerId: customer.id },
  });
  const wk = randomUUID();
  const paid = await ok(buy(saleProduct.id, 4, 'WALLET', wk));
  await ok(buy(saleProduct.id, 4, 'WALLET', wk));
  state = await read(saleProduct.id);
  assert.equal(state.totals.quantityOnHand, 20);
  assert.equal(state.totals.quantityReserved, 4);
  assert.equal(state.product.availableQuantity, 16);
  assert.equal(
    Number(
      (await db.customerWallet.findUniqueOrThrow({ where: { customerId: customer.id } }))
        .availableBalance,
    ),
    Number(walletBefore.availableBalance) - 4000,
  );
  await ok(action(paid.orderId, 'CANCEL'));
  await ok(action(paid.orderId, 'CANCEL'));
  state = await read(saleProduct.id);
  assert.equal(state.product.availableQuantity, 20);
  assert.equal(state.totals.quantityReserved, 0);
  assert.equal(state.balances.find((x) => x.locationId === a.id).quantityOnHand, 20);
  assert.equal(
    Number(
      (await db.customerWallet.findUniqueOrThrow({ where: { customerId: customer.id } }))
        .availableBalance,
    ),
    Number(walletBefore.availableBalance),
  );
  checks.push({
    check:
      'Pending legacy allocation backfill; wallet multi-unit reserve/replay/refund/cancel reverses original location exactly once',
  });
  const shipped = await ok(buy(saleProduct.id, 2));
  await ok(action(shipped.orderId, 'PREPARE'));
  await ok(action(shipped.orderId, 'READY'));
  await ok(action(shipped.orderId, 'SHIP', { shippingCompany: 'QA only' }));
  state = await read(saleProduct.id);
  assert.equal(state.product.availableQuantity, 18);
  assert.equal(state.totals.quantityOnHand, 18);
  assert.equal(state.totals.quantityReserved, 0);
  await ok(action(shipped.orderId, 'SHIP', { shippingCompany: 'QA only' }));
  assert.equal((await read(saleProduct.id)).totals.quantityOnHand, 18);
  await ok(action(shipped.orderId, 'CANCEL'), 409);
  checks.push({
    check: 'Shipment consumes physical reservation once; shipped cancellation remains forbidden',
  });
  const concurrentKey = randomUUID();
  const duplicates = await Promise.all([
    buy(saleProduct.id, 1, 'CASH_ON_DELIVERY', concurrentKey),
    buy(saleProduct.id, 1, 'CASH_ON_DELIVERY', concurrentKey),
  ]);
  assert.ok(
    duplicates.every((r) => r.status === 201),
    JSON.stringify(duplicates),
  );
  assert.equal(duplicates[0].data.orderId, duplicates[1].data.orderId);
  assert.equal((await read(saleProduct.id)).product.availableQuantity, 17);
  // Controller-response eviction/crash window must not create a second COD sale.
  const recoveryKey = randomUUID();
  const recover = await ok(buy(saleProduct.id, 1, 'CASH_ON_DELIVERY', recoveryKey));
  await db.idempotencyKey.deleteMany({ where: { key: recoveryKey, actorId: customer.id } });
  const recovered = await ok(buy(saleProduct.id, 1, 'CASH_ON_DELIVERY', recoveryKey));
  assert.equal(recovered.orderId, recover.orderId);
  assert.equal((await read(saleProduct.id)).product.availableQuantity, 16);
  await ok(action(recover.orderId, 'CANCEL'));
  const last = await create(1);
  await map(last.id);
  const claims = await Promise.all([buy(last.id, 1), buy(last.id, 1)]);
  assert.deepEqual(claims.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await read(last.id)).product.availableQuantity, 0);
  await ok(receipt(last.id, b.id, 2));
  assert.equal((await read(last.id)).product.status, 'ACTIVE');
  await ok(
    request(
      'POST',
      `/admin/products/${last.id}/inventory/adjust`,
      { locationId: b.id, quantityDelta: -2, reason: 'QA count out available units' },
      undefined,
      randomUUID(),
    ),
  );
  assert.equal((await read(last.id)).product.status, 'SOLD');
  await ok(receipt(last.id, b.id, 1));
  assert.equal((await read(last.id)).product.status, 'ACTIVE');
  checks.push({
    check:
      'Exhausted SOLD listings reactivate on replenishment; counted-out ACTIVE listings become SOLD, while DRAFT/CANCELLED stay unpublished',
  });
  checks.push({
    check: 'Concurrent same-key COD returns one order; final-unit race has exactly one winner',
  });
  const poor = await db.customer.create({
    data: {
      displayName: 'Phase4 QA empty wallet',
      phone: `+1556${Date.now()}`,
      wallet: { create: { availableBalance: 0 } },
    },
  });
  const { TokenService } = require('../dist/src/auth/token.service');
  // Token comes from the same real application signer, not an authorization bypass.
  const poorToken = await app.get(TokenService).signCustomerAccess(poor);
  await ok(buy(saleProduct.id, 1, 'WALLET', randomUUID(), poorToken), 409);
  assert.equal((await read(saleProduct.id)).product.availableQuantity, 17);
  // The ordinary owner/customer boundary is also exercised without any token.
  await ok(request('GET', '/admin/inventory/products', undefined, null), 401);
  await ok(request('GET', '/admin/inventory/products', undefined, customerToken), 403);
  const staff = await db.adminUser.create({
    data: {
      name: 'Phase4 QA no permission',
      email: `staff-${randomUUID()}@example.test`,
      normalizedEmail: `staff-${randomUUID()}@example.test`,
      passwordHash: 'not-a-login',
      role: 'VIEWER',
    },
  });
  const staffToken = await app.get(TokenService).signAdminAccess(staff);
  await ok(
    request(
      'POST',
      `/admin/products/${p.id}/inventory/stock-in`,
      { quantity: 1, locationId: b.id },
      staffToken,
      randomUUID(),
    ),
    403,
  );
  await assert.rejects(() =>
    db.inventoryMovement.update({ where: { id: paired[0].id }, data: { quantityAfter: 999 } }),
  );
  await assert.rejects(() =>
    db.inventoryBalance.update({
      where: { productId_locationId: { productId: p.id, locationId: b.id } },
      data: { quantityOnHand: -1 },
    }),
  );
  await assert.rejects(() =>
    db.productListing.update({
      where: { id: p.id },
      data: { availableQuantity: { increment: 1 } },
    }),
  );
  checks.push({
    check:
      'Database nonnegative/commit consistency and append-only triggers reject invalid writes; public/customer inventory reads denied',
  });
  const history = await ok(
    request('GET', `/admin/products/${p.id}/inventory/movements?limit=2`),
    200,
  );
  assert.equal(history.items.length, 2);
  assert.equal(history.meta.hasMore, true);
  const normalized = await ok(
    request(
      'GET',
      '/admin/inventory/products?search=' + encodeURIComponent('الكتروني Phase4') + '&limit=2',
    ),
    200,
  );
  assert.equal(normalized.items.length, 2);
  checks.push({
    check: 'Movement and normalized Arabic product search are paginated',
    products: normalized.items.length,
  });
  // Failed transactions leave no operation, balance or ledger residue.
  const counts = async () =>
    Promise.all([
      db.inventoryOperation.count(),
      db.inventoryMovement.count(),
      db.inventoryBalance.count(),
    ]);
  const priorCounts = await counts();
  await ok(transfer(p.id, b.id, a.id, 999999), 409);
  assert.deepEqual(await counts(), priorCounts);
  const ak = randomUUID(),
    ab = { locationId: b.id, quantityDelta: 1, reason: 'QA durable adjustment' };
  await ok(request('POST', `/admin/products/${p.id}/inventory/adjust`, ab, undefined, ak));
  const afterAdjust = await read(p.id);
  await ok(request('POST', `/admin/products/${p.id}/inventory/adjust`, ab, undefined, ak));
  assert.equal((await read(p.id)).product.availableQuantity, afterAdjust.product.availableQuantity);
  await ok(
    request(
      'POST',
      `/admin/products/${p.id}/inventory/adjust`,
      { ...ab, quantityDelta: 2 },
      undefined,
      ak,
    ),
    409,
  );
  const concurrent = await create(20);
  await map(concurrent.id);
  const old = await ok(buy(concurrent.id, 4));
  const mixed = await Promise.all([buy(concurrent.id, 3), action(old.orderId, 'CANCEL')]);
  // Existing order actions can fail safely on a serialization conflict; retry the same transition.
  if (mixed[1].status !== 201) await ok(action(old.orderId, 'CANCEL'));
  assert.equal(mixed[0].status, 201, JSON.stringify(mixed[0]));
  const mixedState = await read(concurrent.id);
  assert.equal(mixedState.product.availableQuantity, 17);
  assert.equal(mixedState.totals.quantityReserved, 3);
  checks.push({
    check:
      'Failed transfer rolls back operation/ledger/balance; adjustment replay/conflict; concurrent purchase and cancellation preserve 17 available/3 reserved',
  });
  const config = app.get(require('@nestjs/config').ConfigService);
  config.set('inventory.managementEnabled', false);
  await ok(request('GET', '/admin/inventory/products'), 404);
  const disabledBuy = await ok(buy(saleProduct.id, 1));
  assert.equal(
    (
      await db.inventoryAllocation.aggregate({
        where: { orderItem: { orderId: disabledBuy.orderId }, status: 'RESERVED' },
        _sum: { quantity: true },
      })
    )._sum.quantity,
    1,
  );
  await ok(action(disabledBuy.orderId, 'CANCEL'));
  config.set('inventory.managementEnabled', true);
  checks.push({
    check:
      'Management flag off hides inventory routes but never disables mapped commerce reservations/reversal',
  });
  // An inconsistent imported ledger is detected, never repaired by reconciliation.
  // This deliberately appends a false QA event: no trigger disabling or shared fixtures.
  const beforeCorruption = await read(p.id),
    balance = beforeCorruption.balances.find((x) => x.locationId === b.id);
  const corruptOp = await db.inventoryOperation.create({
    data: {
      scope: 'QA_CORRUPTION',
      key: randomUUID(),
      kind: 'QA_ONLY',
      requestHash: 'qa',
      actorType: 'SYSTEM',
    },
  });
  await db.inventoryMovement.create({
    data: {
      productId: p.id,
      locationId: b.id,
      operationId: corruptOp.id,
      movementType: 'ADJUSTMENT_IN',
      quantityDelta: 1,
      quantityBefore: balance.quantityOnHand,
      quantityAfter: balance.quantityOnHand + 1,
      reservedBefore: 0,
      reservedAfter: 0,
      warehouseCode: w.code,
      locationCode: b.code,
    },
  });
  const corrupt = await read(p.id);
  assert.equal(corrupt.reconciliation.state, 'MISMATCH');
  assert.equal(corrupt.product.availableQuantity, beforeCorruption.product.availableQuantity);
  assert.equal(corrupt.reconciliation.locationDifferences.length, 1);
  await ok(receipt(p.id, b.id, 1), 409);
  checks.push({
    check:
      'Read-only reconciliation detects deliberately inconsistent per-location ledger and blocks new stock writes without rewriting quantities',
    productId: p.id,
  });
  // A failed/partially completed batch can resume by id; no old order rows are rewritten.
  const resumeA = await create(2),
    resumeB = await create(3);
  const oldOrders = await db.orderItem.findMany({
    where: { productListingId: saleProduct.id },
    orderBy: { id: 'asc' },
  });
  await map(resumeA.id);
  const openingCount = await db.inventoryMovement.count({ where: { productId: resumeA.id } });
  await map(resumeA.id);
  await map(resumeB.id);
  assert.equal(
    await db.inventoryMovement.count({ where: { productId: resumeA.id } }),
    openingCount,
  );
  assert.deepEqual(
    await db.orderItem.findMany({
      where: { productListingId: saleProduct.id },
      orderBy: { id: 'asc' },
    }),
    oldOrders,
  );
  checks.push({
    check: 'Per-product backfill resume does not duplicate openings or rewrite existing OrderItems',
  });
  const bad = await create(3),
    good = await create(2);
  const malformed = await ok(buy(bad.id, 1));
  const badItem = await db.orderItem.findFirstOrThrow({ where: { orderId: malformed.orderId } });
  await db.orderItem.update({ where: { id: badItem.id }, data: { quantity: 2 } }); // disposable unsupported imported history
  const review = await ok(
    request('POST', '/admin/inventory/backfill', { productId: bad.id, dryRun: true }),
  );
  assert.equal(review.items[0].reviewRequired, true);
  assert.equal((await read(bad.id)).product.inventoryMappedAt, null);
  const predecessor = await db.productListing.findFirstOrThrow({
    where: { id: { lt: bad.id } },
    orderBy: { id: 'desc' },
  });
  const partial = await ok(
    request('POST', '/admin/inventory/backfill', {
      dryRun: false,
      afterId: predecessor.id,
      limit: 2,
    }),
  );
  assert.equal(partial.items.find((x) => x.productId === bad.id).reviewRequired, true);
  assert.ok(partial.items.some((x) => x.productId === good.id && !x.reviewRequired));
  const beforeRepeat = await db.inventoryMovement.count({ where: { productId: good.id } });
  await ok(
    request('POST', '/admin/inventory/backfill', {
      dryRun: false,
      afterId: predecessor.id,
      limit: 2,
    }),
  );
  assert.equal(await db.inventoryMovement.count({ where: { productId: good.id } }), beforeRepeat);
  assert.equal((await db.orderItem.findUniqueOrThrow({ where: { id: badItem.id } })).quantity, 2);
  await ok(
    request('POST', '/admin/inventory/backfill', { productId: 'missing-product', dryRun: true }),
    404,
  );
  checks.push({
    check:
      'Dry-run detects unsupported historical quantities without writes; mixed successful/review batch safely resumes with no duplicate openings or history rewrite',
  });
};
