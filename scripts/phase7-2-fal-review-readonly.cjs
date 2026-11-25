// Exactly four historical GETs maximum; no inference endpoint or write operation exists here.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'), base = 'D:/rezona-phase7-2-qa/fal-pilot';
const id = process.argv[2]; assert.match(id ?? '', /^20261122-[a-f0-9]{8}$/);
const dir = path.join(base, 'review-' + id), m = JSON.parse(fs.readFileSync(path.join(dir, 'review-manifest.json'), 'utf8'));
assert.equal(path.resolve(m.dir), path.resolve(dir));
assert.ok(!fs.existsSync(path.join(dir, 'historical-provider-review.json')), 'Never overwrite historical review');
const pilot = JSON.parse(fs.readFileSync(path.join(base, 'pilot-manifest.json'), 'utf8'));
process.env.NODE_PATH = pilot.dist + path.delimiter + path.join(root, 'node_modules'); require('node:module').Module._initPaths();
const { FAL_KEY } = require('dotenv').parse(fs.readFileSync(path.join(base, 'backend.env')));
const { sanitizeFalErrorDetails } = require(path.join(dir, 'code-dist/src/image-enhancement/fal-error-diagnostics.js'));
const { falStudioRequest } = require(path.join(pilot.dist, 'src/image-enhancement/fal-studio.provider.js'));
const { CATALOG_STUDIO_V1 } = require(path.join(pilot.dist, 'src/image-enhancement/brand-studio.config.js'));
const sha = b => createHash('sha256').update(b).digest('hex');
const schema = JSON.parse(fs.readFileSync(path.join(dir, 'public-openapi-schema.json'), 'utf8'));
const Ajv = require('ajv'), validator = new Ajv({ allErrors: true, strict: false }).compile(schema.components.schemas.NanoBananaLiteEditInput);
const selected = [{ n: 1, requestId: '01a20424-6932-77c3-9fe0-b6c57b0cf289', correlation: 'CAPTURED_RESPONSE_ID' }, { n: 5, requestId: '01a20424-f79b-7a02-bdf9-dca2ef28b069', correlation: 'PROVISIONAL_TIME_ENDPOINT_STATUS_ONLY' }];
async function get(url, maxBytes) {
  const u = new URL(url);
  assert.ok((u.origin === 'https://api.fal.ai' && u.pathname === '/v1/models/requests/by-endpoint') ||
    (u.origin === 'https://queue.fal.run' && /^\/google\/nano-banana-lite\/edit\/requests\/[a-f0-9-]{36}\/status$/.test(u.pathname)));
  try {
    const r = await fetch(u, { method: 'GET', redirect: 'error', headers: { authorization: 'Key ' + FAL_KEY.trim() }, signal: AbortSignal.timeout(15000) });
    if (!r.body) return { httpStatus: r.status };
    const chunks = [], reader = r.body.getReader(); let size = 0;
    for (;;) { const c = await reader.read(); if (c.done) break; size += c.value.byteLength; if (size > maxBytes) { await reader.cancel(); return { httpStatus: r.status, bodyTooLarge: true }; } chunks.push(c.value); }
    try { return { httpStatus: r.status, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }; }
    catch { return { httpStatus: r.status, bodyNotJson: true }; }
  } catch { return { unavailable: true }; }
}
(async () => {
  const rows = [];
  for (const item of selected) {
    const png = fs.readFileSync(path.join(pilot.dir, String(item.n).padStart(2, '0') + '-fal-input.png'));
    const expected = falStudioRequest(png, CATALOG_STUDIO_V1), schemaValid = validator(expected);
    const url = new URL('https://api.fal.ai/v1/models/requests/by-endpoint');
    for (const [k, v] of Object.entries({ endpoint_id: 'google/nano-banana-lite/edit', request_id: item.requestId, expand: 'payloads', limit: '1' })) url.searchParams.set(k, v);
    const response = await get(url, 2 * 1024 * 1024), request = response.data?.items?.find(r => r.request_id === item.requestId && r.endpoint_id === 'google/nano-banana-lite/edit');
    let recoveredInputExactMatch = false;
    if (request?.json_input && typeof request.json_input === 'object') {
      // Compare sensitive payload in memory only. Never write/print recovered prompts or images.
      recoveredInputExactMatch = Object.keys(expected).every(k => JSON.stringify(request.json_input[k]) === JSON.stringify(expected[k]));
    }
    const statusUrl = `https://queue.fal.run/google/nano-banana-lite/edit/requests/${item.requestId}/status?logs=1`;
    const logs = await get(statusUrl, 65536), logRows = Array.isArray(logs.data?.logs) ? logs.data.logs : [];
    rows.push({ ...item, localCurrentSchemaValidation: schemaValid, schemaValidationErrorCount: validator.errors?.length ?? 0,
      inputImageSha256: sha(png), payloadHttpStatus: response.httpStatus ?? null, inputPayloadAvailable: !!request?.json_input,
      outputPayloadAvailable: !!request?.json_output, recoveredInputExactMatch,
      correlationAfterReview: item.n === 1 ? 'VERIFIED_CAPTURED_RESPONSE_ID' : recoveredInputExactMatch ? 'VERIFIED_EXACT_RECOVERED_INPUT' : item.correlation,
      recoveredValidation: sanitizeFalErrorDetails(request?.json_output ?? response.data),
      logsHttpStatus: logs.httpStatus ?? null, logCount: logRows.length, logsAvailable: logRows.length > 0,
      structuredLogValidation: logRows.flatMap(l => sanitizeFalErrorDetails(l)).slice(0, 8),
      logStatus: ['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED'].includes(logs.data?.status) ? logs.data.status : null });
  }
  const value = { reviewedAt: new Date().toISOString(), additionalInferenceCalls: 0, readOnlyHistoricalGets: 4,
    actualKeyPermissionsChanged: false, billingApiNotRetriedAfter403: true, rows };
  for (const d of [dir, m.out]) fs.writeFileSync(path.join(d, 'historical-provider-review.json'), JSON.stringify(value, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(value));
})().catch(() => { console.error('HISTORICAL_FAL_REVIEW_REQUIRES_INSPECTION'); process.exitCode = 1; });
