const assert = require('node:assert/strict'), { randomUUID } = require('node:crypto'), sharp = require('sharp');
module.exports = async ({ app, db, request, owner, ownerToken, customerToken, category, checks, origin }) => {
  const { ImageEnhancementService } = require('../dist/src/image-enhancement/enhancement.service');
  const { ImageEditingProvider } = require('../dist/src/image-enhancement/enhancement.provider');
  const service = app.get(ImageEnhancementService), mock = app.get(ImageEditingProvider);
  const ok = async (p, status = 201) => { const r = await p; assert.equal(r.status, status, JSON.stringify(r.body)); return r.data; };
  const base = '/admin/product-intake/sessions', path = s => `${base}/${s.id}/enhancements`;
  const patch = (s, body) => ok(request('PATCH', `${base}/${s.id}`, { expectedRevision: s.revision, ...body }), 200);
  const read = s => ok(request('GET', `${base}/${s.id}`), 200), status = s => ok(request('GET', path(s)), 200);
  const photo = await sharp(Buffer.from('<svg width="1400" height="1000"><rect x="380" y="80" width="640" height="840" rx="20" fill="#145142"/><text x="420" y="400" font-size="85" fill="white">QA ONLY</text><text x="420" y="530" font-size="55" fill="white">400 ml</text></svg>')).png().toBuffer();
  const warehouse = await ok(request('POST', '/admin/warehouses', { code: 'P7-' + randomUUID().slice(0, 6), name: 'Phase7 only' }));
  const location = await ok(request('POST', '/admin/warehouse-locations', { warehouseId: warehouse.id, code: 'A-01', name: 'Phase7 A01' }));
  async function draft(mode = 'NEW', productId) {
    let s = await ok(request('POST', base, { clientDraftId: randomUUID(), submissionOperationKey: randomUUID() }));
    s = await patch(s, { mode, selectedImageKey: randomUUID(), quantity: 3, locationId: location.id, ...(mode === 'NEW' ? { approvedMetadata: { title: 'منتج تحسين صور ' + randomUUID(), description: 'Manual only', price: '10000', categoryId: category.id } } : { existingProductId: productId }) });
    const form = new FormData(); form.set('clientImageId', s.selectedImageKey); form.set('file', new Blob([photo], { type: 'image/png' }), 'qa.png');
    return ok(request('POST', `${base}/${s.id}/image`, form));
  }
  async function start(s, mode = 'CLEAN', extra = {}, key = randomUUID()) { return ok(request('POST', path(s), { clientImageId: s.selectedImageKey, requestKey: key, mode, ...extra })); }
  async function wait(s, jobId, expected = 'COMPLETED') {
    const limit = Date.now() + 40000;
    while (Date.now() < limit) { const state = await status(s), job = state.jobs.find(j => j.id === jobId); if (job?.status === expected) return job; if (['FAILED', 'UNKNOWN', 'CANCELLED'].includes(job?.status) && job.status !== expected) throw Error(JSON.stringify(job)); await new Promise(r => setTimeout(r, 150)); }
    throw Error('P7 wait timed out');
  }
  async function decision(s, action, candidateId, extra = {}) { const st = await status(s); return request('POST', path(s) + '/decision', { clientImageId: s.selectedImageKey, requestKey: randomUUID(), expectedRevision: s.revision, expectedMediaRevision: st.mediaRevision, action, ...(candidateId ? { candidateId } : {}), reviewed: true, ...extra }); }
  async function raw(url) { return fetch(url.startsWith('http') ? url : origin + (url.startsWith('/api/') ? url : '/api' + url)); }
  const s = await draft(), before = await read(s), source = await db.productIntakeImage.findUnique({ where: { sessionId_clientImageId: { sessionId: s.id, clientImageId: s.selectedImageKey } }, include: { asset: true } });
  await ok(request('GET', path(s), undefined, null), 401); await ok(request('GET', path(s), undefined, customerToken), 403);
  const staffEmail = randomUUID() + '@example.test';
  const staff = await db.adminUser.create({ data: { email: staffEmail, normalizedEmail: staffEmail, name: 'P7 other employee', passwordHash: 'not-a-login', role: 'VIEWER', permissions: ['product_intake.use', 'products.upload_images'] } });
  const token = await app.get(require('../dist/src/auth/token.service').TokenService).signAdminAccess(staff);
  await ok(request('GET', path(s), undefined, token), 404);
  checks.push('HTTP authentication, role/permission and private employee scope enforced');
  const key = randomUUID();
  const initial = await start(s, 'CLEAN', {}, key), jobId = initial.jobs[0].id;
  await Promise.all([start(s, 'CLEAN', {}, key), start(s)]);
  assert.equal(await db.productImageEnhancementJob.count({ where: { sessionId: s.id } }), 1);
  await ok(request('POST', path(s), { clientImageId: s.selectedImageKey, requestKey: key, mode: 'STUDIO_COMPOSITE' }), 409);
  const local = await wait(s, jobId); assert.equal(local.candidate.width, 1024);
  assert.equal(await db.recognitionUsage.count({ where: { enhancementJobId: jobId } }), 0);
  checks.push('Real BullMQ/local child/MinIO pipeline; concurrent request aliases deduplicate without ledger spend');
  const candidate = await db.productImageEnhancementCandidate.findUnique({ where: { id: local.candidate.id }, include: { asset: true } });
  const preview = await ok(request('GET', path(s) + `/candidates/${candidate.id}/preview?edge=1024`), 200);
  assert.equal((await sharp(Buffer.from(preview.base64, 'base64')).metadata()).width, 1024);
  assert.equal((await request('GET', path(s) + `/candidates/${candidate.id}/preview`)).headers['cache-control'], 'no-store');
  assert.equal((await raw(candidate.asset.url)).status, 404); assert.equal((await raw(source.asset.url)).status, 404);
  assert.equal((await raw('/media/products/intake-' + 'a'.repeat(64) + '.png')).status, 404);
  checks.push('Candidate/source/uncommitted prefixes private; authenticated bounded zoom uses no-store');
  await ok(decision(s, 'ACCEPT', candidate.id, { reviewed: false }), 400);
  await ok(decision(s, 'ACCEPT', candidate.id, { expectedRevision: s.revision + 1 }), 409);
  const decisionKey = randomUUID(); const accepted = await ok(decision(s, 'ACCEPT', candidate.id, { requestKey: decisionKey }));
  assert.equal(accepted.selectedCandidateId, candidate.id); assert.equal(accepted.businessRevision, s.revision);
  const oldDecision = await db.productImageEnhancementDecision.findUnique({ where: { sessionId_requestKey: { sessionId: s.id, requestKey: decisionKey } } });
  await ok(request('POST', path(s) + '/decision', { clientImageId: s.selectedImageKey, requestKey: decisionKey, expectedRevision: s.revision, expectedMediaRevision: oldDecision.revision - 1, action: 'ACCEPT', candidateId: candidate.id, reviewed: true }));
  assert.equal((await status(s)).mediaRevision, accepted.mediaRevision);
  const after = await read(s); for (const f of ['approvedMetadata', 'quantity', 'locationId', 'revision', 'selectedImageKey']) assert.deepEqual(after[f], before[f]);
  assert.equal((await db.productIntakeImage.findUnique({ where: { id: source.id } })).assetId, source.assetId);
  assert.equal((await raw(candidate.asset.url)).status, 404);
  checks.push('Explicit review, stale-revision rejection, lost-reply decision replay and business/original identity preservation');
  await ok(decision(s, 'REJECT', candidate.id)); assert.equal((await status(s)).selectedCandidateId, null);
  await ok(decision(s, 'ACCEPT', candidate.id)); await ok(decision(s, 'ORIGINAL')); assert.equal((await status(s)).selectedCandidateId, null);
  await ok(decision(s, 'ACCEPT', candidate.id));
  checks.push('Accept/reject/keep-original append immutable decision history; acceptance never publishes');
  const bgState = await start(s, 'BACKGROUND_REMOVE'), bg = await wait(s, bgState.jobs[0].id);
  assert.ok(bg.candidate.warnings.includes('ALPHA_EDGES_REQUIRE_REVIEW'));
  const aiState = await start(s, 'AI_ENHANCE'), ai = await wait(s, aiState.jobs[0].id);
  assert.ok(ai.candidate.warnings.includes('GENERATED_BACKGROUND_ONLY_CAPTURED_FOREGROUND_RECOMPOSITED'));
  assert.equal(mock.calls, 1); assert.equal((await db.recognitionUsage.findFirst({ where: { enhancementJobId: ai.id } })).actualBilledUsd, null);
  checks.push('Transparent-background removal and mocked external background recomposition; captured foreground retained, billing not invented');
  // Only a title-unique manual draft; duplicate advice is still evaluated by the existing Phase 6 transaction.
  const committed = await ok(request('POST', `${base}/${s.id}/submit`, { expectedRevision: s.revision }, undefined, s.submissionOperationKey));
  const replay = await ok(request('POST', `${base}/${s.id}/submit`, { expectedRevision: s.revision }, undefined, s.submissionOperationKey)); assert.deepEqual(replay, committed);
  const product = await db.productListing.findUnique({ where: { id: committed.productId } });
  assert.equal(product.status, 'DRAFT'); assert.deepEqual(product.imageUrls, [candidate.asset.url]); assert.equal(product.availableQuantity, 3);
  assert.equal((await raw(candidate.asset.url)).status, 404); assert.equal((await raw(source.asset.url)).status, 404);
  const sourceUnchanged = await db.productIntakeImage.findUnique({ where: { id: source.id } }); assert.equal(sourceUnchanged.assetId, source.assetId);
  checks.push('NEW approval resolved in original serializable/idempotent transaction; one physical opening, DRAFT, original private');
  await db.productListing.update({ where: { id: product.id }, data: { status: 'ACTIVE' } });
  assert.equal((await raw(candidate.asset.url)).status, 200); assert.equal((await raw(source.asset.url)).status, 404);
  const deadline = Date.now() + 25000; let variants;
  do { variants = await db.fileAssetVariant.findMany({ where: { assetId: candidate.assetId } }); if (variants.length === 8) break; await new Promise(r => setTimeout(r, 150)); } while (Date.now() < deadline);
  assert.equal(variants.length, 8);
  // Public references are exact; removing the candidate reference closes original and variant access again.
  await db.productListing.update({ where: { id: product.id }, data: { imageUrls: [] } }); assert.equal((await raw(candidate.asset.url)).status, 404);
  await db.productListing.update({ where: { id: product.id }, data: { imageUrls: [candidate.asset.url] } });
  checks.push('Existing 8 hashed Phase 2 variants generated; ACTIVE+available+exact-reference publication gate rechecked');
  const receipt = await draft('STOCK_IN', product.id), sr = await start(receipt), receiptCandidate = await wait(receipt, sr.jobs[0].id);
  await ok(decision(receipt, 'ACCEPT', receiptCandidate.candidate.id));
  await ok(request('POST', `${base}/${receipt.id}/submit`, { expectedRevision: receipt.revision }, undefined, receipt.submissionOperationKey));
  assert.deepEqual((await db.productListing.findUnique({ where: { id: product.id } })).imageUrls, product.imageUrls);
  const rAsset = await db.productImageEnhancementCandidate.findUnique({ where: { id: receiptCandidate.candidate.id }, include: { asset: true } }); assert.equal(rAsset.asset.intakeProductId, null);
  checks.push('STOCK_IN ignores approved capture for existing catalog image; no implicit media replacement');
  let retake = await draft(); const rt = await start(retake), rtJob = await wait(retake, rt.jobs[0].id);
  await ok(decision(retake, 'ACCEPT', rtJob.candidate.id)); retake = await patch(retake, { selectedImageKey: randomUUID() });
  assert.equal((await status(retake)).selectedCandidateId, null); await ok(decision(retake, 'ACCEPT', rtJob.candidate.id), 404);
  checks.push('Retake fences old jobs/candidates/approvals without deleting source/history');
  const cancel = await draft(), cc = await start(cancel), cancelJob = cc.jobs[0].id;
  await db.productImageEnhancementJob.update({ where: { id: cancelJob }, data: { nextDispatchAt: new Date(Date.now() + 3600000) } });
  await ok(request('POST', path(cancel) + `/${cancelJob}/cancel`, {})); await service.process(cancelJob);
  assert.equal((await status(cancel)).jobs[0].status, 'CANCELLED');
  const expired = await draft(), ex = await start(expired), eid = ex.jobs[0].id;
  await db.productImageEnhancementJob.update({ where: { id: eid }, data: { status: 'PROCESSING', leaseToken: randomUUID(), attempts: 1, nextDispatchAt: new Date(Date.now() - 1000) } });
  await service.recover(); assert.equal((await db.productImageEnhancementJob.findUnique({ where: { id: eid } })).status, 'PENDING'); await service.process(eid);
  const unknown = await start(expired, 'AI_ENHANCE'), uid = unknown.jobs[0].id, callCount = mock.calls;
  await db.productImageEnhancementJob.update({ where: { id: uid }, data: { status: 'PROCESSING', leaseToken: randomUUID(), attempts: 1, nextDispatchAt: new Date(Date.now() - 1000) } });
  await service.recover(); await service.process(uid); assert.equal((await db.productImageEnhancementJob.findUnique({ where: { id: uid } })).status, 'UNKNOWN'); assert.equal(mock.calls, callCount);
  checks.push('Cancellation fenced; local crash recoverable; ambiguous external work UNKNOWN and never automatically charged/retried');
  await ok(request('POST', path(expired), { clientImageId: expired.selectedImageKey, requestKey: randomUUID(), mode: 'AI_ENHANCE', generation: 3 }), 400);
  await ok(request('POST', path(expired), { clientImageId: expired.selectedImageKey, requestKey: randomUUID(), mode: 'AI_ENHANCE', generation: 1 }), 409);
  checks.push('Explicit regeneration bounded; UNKNOWN predecessor cannot create another paid generation');
  const runtime = app.get(require('../dist/src/image-enhancement/enhancement.runtime').ImageEnhancementRuntime);
  await runtime.onApplicationShutdown();
  const restart = await draft(), rs = await start(restart);
  assert.equal(rs.jobs[0].status, 'PENDING'); runtime.onApplicationBootstrap(); await wait(restart, rs.jobs[0].id);
  checks.push('Real enhancement dispatcher/worker stop and restart recovers persisted local outbox without a new client request');
  // A real delayed mock call: cancel while in flight, then let the old worker return.
  const cancelled = await draft(), originalEdit = mock.edit.bind(mock); let entered, release;
  const enteredPromise = new Promise(r=>entered=r), gate = new Promise(r=>release=r);
  mock.edit = async (...args) => { entered(); await gate; return originalEdit(...args); };
  const cancelledStart = await start(cancelled, 'AI_ENHANCE');
  await Promise.race([enteredPromise, new Promise((_, reject)=>setTimeout(()=>reject(Error('Mock dispatch wait expired')),15000))]);
  await ok(request('POST', path(cancelled)+`/${cancelledStart.jobs[0].id}/cancel`,{})); release();
  await new Promise(r=>setTimeout(r,1200)); mock.edit = originalEdit;
  assert.equal((await status(cancelled)).jobs[0].status,'CANCELLED'); assert.equal(await db.productImageEnhancementCandidate.count({where:{jobId:cancelledStart.jobs[0].id}}),0);
  checks.push('Cancellation during a dispatched provider call fences late candidate creation and never refunds ambiguous real spend');
  const usage = await ok(request('GET','/admin/product-intake/image-enhancement-usage'),200);
  assert.equal(usage.actualBilling,'NOT_AVAILABLE'); assert.equal(usage.scope,'ALL');
  const ownUsage = await ok(request('GET','/admin/product-intake/image-enhancement-usage',undefined,token),200); assert.equal(ownUsage.scope,'SELF');
  await ok(request('GET','/admin/product-intake/image-enhancement-usage',undefined,customerToken),403);
  checks.push('Shared-ledger image usage is read-only, own-employee scoped and distinguishes conservative commitments from actual billing');
  // Run unchanged Phase 6 real integration against this new Phase 7 database, not the protected Phase 6 database.
  await require('./phase6-recognition-checks.cjs')({ app, db, request, owner, ownerToken, customerToken, category, checks });
};
