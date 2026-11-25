// Read-only reconciliation. This file has NO inference, retry, submit or publish path.
if (process.env.REZONA_FAL_POSTFLIGHT !== '1') throw Error('Explicit read-only pilot audit required');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'), base = 'D:/rezona-phase7-2-qa/fal-pilot';
const m = JSON.parse(fs.readFileSync(path.join(base, 'pilot-manifest.json'), 'utf8'));
assert.match(m.id, /^[a-f0-9]{8}$/);
assert.equal(m.db, 'rezona_phase72_fal_' + m.id);
assert.equal(path.resolve(m.dir), path.resolve(base, 'run-' + m.id));
const result = JSON.parse(fs.readFileSync(path.join(m.dir, 'pilot-result.json'), 'utf8'));
assert.equal(result.realInferenceCalls, 2);
const secrets = JSON.parse(fs.readFileSync('D:/rezona-phase7-2-qa/20261122-6470081b/runtime-secrets.json', 'utf8'));
const { FAL_KEY } = require('dotenv').parse(fs.readFileSync(path.join(base, 'backend.env')));
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: `postgresql://phase72_qa:${encodeURIComponent(secrets.postgresPassword)}@127.0.0.1:55454/${m.db}` } }, log: [] });
const sha = b => createHash('sha256').update(b).digest('hex');
const fields = (o, names) => Object.fromEntries(names.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const safeId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(x);
const start = new Date(Math.min(...result.rows.map(r => Date.parse(r.requestTimestamp))) - 5000).toISOString();
const end = new Date(Date.parse(result.time) + 5000).toISOString();
let stage = 'integrity';
async function readFal(endpoint, extra = {}) {
  // All allowed operations are GET metadata, without input/output payload expansion.
  assert.ok(['requests/by-endpoint', 'billing-events'].includes(endpoint));
  const u = new URL('https://api.fal.ai/v1/models/' + endpoint);
  for (const [k, v] of Object.entries({ endpoint_id: m.primaryModel, start, end, limit: '100', ...extra })) u.searchParams.set(k, v);
  try {
    const r = await fetch(u, { method: 'GET', redirect: 'error', headers: { authorization: 'Key ' + FAL_KEY.trim() }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) { await r.body?.cancel(); return { httpStatus: r.status }; }
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > 2 * 1024 * 1024) return { httpStatus: r.status, error: 'METADATA_RESPONSE_TOO_LARGE' };
    const data = JSON.parse(b.toString('utf8'));
    const source = endpoint === 'billing-events' ? data.billing_events : data.items;
    const names = endpoint === 'billing-events'
      ? ['request_id', 'endpoint_id', 'timestamp', 'quantity', 'unit', 'unit_price', 'cost_subtotal', 'cost_discount', 'cost_total', 'cost_estimate_nano_usd']
      : ['request_id', 'endpoint_id', 'sent_at', 'started_at', 'ended_at', 'status_code', 'duration'];
    return { httpStatus: r.status, hasMore: data.has_more === true, rows: (source ?? []).filter(x => x.endpoint_id === m.primaryModel && safeId(x.request_id)).map(x => fields(x, names)) };
  } catch (e) { return { error: 'READ_ONLY_METADATA_UNAVAILABLE',
    reason: e?.name === 'TimeoutError' ? 'TIMEOUT' : e?.name === 'SyntaxError' ? 'NON_JSON_RESPONSE' : 'NETWORK_OR_RESPONSE_ERROR' }; }
}
(async () => {
  const originalJournal = JSON.parse(fs.readFileSync('D:/rezona-phase7-1-qa/real-products-20261121/intake-journal.json', 'utf8'));
  const integrity = m.selectedPhotos.map(p => {
    const old = originalJournal.products.find(o => o.n === p.n);
    assert.equal(sha(fs.readFileSync(old.originalPath)), p.originalSha256);
    assert.equal(sha(fs.readFileSync(path.join(m.dir, String(p.n).padStart(2, '0') + '-original.jpeg'))), p.originalSha256);
    assert.equal(sha(fs.readFileSync(path.join(m.dir, String(p.n).padStart(2, '0') + '-mask.png'))), p.maskHash);
    return { n: p.n, originalAndPrivateCopyUnchanged: true, maskMatchesPriorApprovedSource: true };
  });
  stage = 'database';
  const database = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const counts = {};
    for (const model of ['productListing', 'customer', 'customerWallet', 'walletEntry', 'order', 'auction', 'inventoryBalance', 'inventoryMovement', 'inventoryAllocation', 'warehouse', 'warehouseLocation']) {
      counts[model] = await tx[model].count(); assert.equal(counts[model], 0);
    }
    const sessions = await tx.productIntakeSession.findMany({ select: { id: true, status: true, completedProductId: true, quantity: true, locationId: true } });
    assert.equal(sessions.length, 2);
    for (const s of sessions) { assert.equal(s.status, 'DRAFT'); assert.equal(s.completedProductId, null); assert.equal(s.quantity, null); assert.equal(s.locationId, null); }
    const jobs = await tx.productImageEnhancementJob.findMany({ select: { id: true, sourceHash: true, mode: true, provider: true, status: true, attempts: true, generation: true, providerRequestId: true, startedAt: true, completedAt: true, errorCode: true } });
    const paid = jobs.filter(j => j.provider === 'fal'); assert.equal(paid.length, 2);
    for (const j of paid) { assert.equal(j.attempts, 1); assert.equal(j.generation, 0); assert.ok(m.selectedPhotos.some(p => p.sourceHash === j.sourceHash)); }
    const ledger = await tx.recognitionUsage.findMany({ select: { enhancementJobId: true, provider: true, status: true, reservedUsd: true, committedUsd: true, estimatedUsd: true, actualBilledUsd: true, latencyMs: true, errorCode: true } });
    assert.equal(ledger.length, 2); assert.ok(ledger.every(u => u.provider === 'fal'));
    assert.equal(await tx.fileAsset.count({ where: { OR: [{ intakePrivate: false }, { intakeProductId: { not: null } }] } }), 0);
    const decisions = await tx.productImageEnhancementDecision.findMany({ select: { sessionId: true, action: true, selectedCandidateId: true } });
    assert.equal(decisions.length, 2); // Only prior local-source approval replay; no fal candidate acceptance.
    for (const row of result.rows) assert.ok(!row.candidateId || !decisions.some(d => d.selectedCandidateId === row.candidateId));
    return { readOnly: true, targetDatabase: m.db, counts, sessions, jobs, ledger, allAssetsPrivateAndUnassociated: true, noFalCandidateAccepted: true };
  });
  stage = 'request_metadata';
  const onlyKnown = process.argv[2] === 'known-request-only';
  const onlyFailed = process.argv[2] === 'failed-request-only';
  const knownId = result.rows.find(r => safeId(r.requestId))?.requestId;
  const requests = await readFal('requests/by-endpoint', onlyKnown ? { request_id: knownId } : onlyFailed ? { status: 'user_error' } : {});
  stage = 'billing_metadata';
  const billing = onlyFailed ? { error: 'NOT_RETRIED_AFTER_BILLING_PERMISSION_403' }
    : await readFal('billing-events', { source: 'billed', ...(onlyKnown ? { request_id: knownId } : {}) });
  const correlation = result.rows.map(row => {
    const direct = requests.rows?.find(r => r.request_id === row.requestId);
    const candidates = requests.rows?.filter(r => r.status_code === 422 && Date.parse(r.sent_at ?? r.started_at) >= Date.parse(row.requestTimestamp) - 2000 && Date.parse(r.ended_at ?? r.started_at) <= Date.parse(result.time) + 2000) ?? [];
    const request = direct ?? (!row.requestId && candidates.length === 1 ? candidates[0] : null);
    const events = request ? billing.rows?.filter(e => e.request_id === request.request_id) ?? [] : [];
    return { n: row.n, request, correlation: direct ? 'EXACT_CAPTURED_REQUEST_ID' : request ? 'INFERRED_UNIQUE_422_IN_PILOT_TIME_WINDOW' : 'NOT_AVAILABLE',
      billedEvents: events, actualReportedCostUsd: events.length && events.every(e => Number.isFinite(e.cost_total)) ? events.reduce((s, e) => s + e.cost_total, 0) : null,
      missingEventDoesNotProveZeroCharge: events.length === 0 };
  });
  const audit = { auditedAt: new Date().toISOString(), localTimezone: 'Asia/Baghdad', pilotId: m.id, additionalInferenceCalls: 0, integrity, database, requests, billing, correlation,
    billingCaution: 'Billed events are provider-reported per-request charges, not a final invoice. A missing or inaccessible event is not proof of zero cost. No automatic retry or paid regeneration.' };
  const name = 'postflight-' + Date.now() + '.json';
  fs.writeFileSync(path.join(m.dir, name), JSON.stringify(audit, null, 2), { flag: 'wx' });
  fs.writeFileSync(path.join(m.out, name), JSON.stringify(audit, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ passed: true, name, originalsAndMasksVerified: integrity.length, businessRecordCounts: database.counts, requestsHttp: requests.httpStatus ?? null, billingHttp: billing.httpStatus ?? null, correlation, additionalInferenceCalls: 0 }));
})().catch(e => {
  // Only local error classification, never SQL arguments, URLs, credentials or raw provider bodies.
  console.error(JSON.stringify({ code: 'FAL_READ_ONLY_POSTFLIGHT_REQUIRES_REVIEW', stage,
    name: /^[A-Za-z]{1,60}$/.test(e?.name ?? '') ? e.name : null,
    kind: e instanceof assert.AssertionError ? 'ASSERTION' : /^P\d{4}$/.test(e?.code ?? '') ? e.code : e?.name === 'TypeError' ? 'TYPE_ERROR' : 'LOCAL_ERROR',
    ...(e instanceof assert.AssertionError && [e.actual, e.expected].every(v => typeof v === 'number' || typeof v === 'boolean' || v === null) ? { actual: e.actual, expected: e.expected } : {}) }));
  process.exitCode = 1;
}).finally(() => db.$disconnect());
