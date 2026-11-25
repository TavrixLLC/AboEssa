// OFFLINE review + public schema GET only. No inference, billing mutation or database write.
const fs = require('node:fs'), path = require('node:path'), { randomUUID, createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), base = 'D:/rezona-phase7-2-qa/fal-pilot';
const pilot = JSON.parse(fs.readFileSync(path.join(base, 'pilot-manifest.json'), 'utf8'));
assert.equal(pilot.id, '84a2de4a');
const id = '20261122-' + randomUUID().slice(0, 8), dir = path.join(base, 'review-' + id), out = path.join(root, 'docs/benchmarks/phase7-2/fal-review-' + id);
if (fs.existsSync(dir) || fs.existsSync(out)) throw Error('No-overwrite review destination');
fs.mkdirSync(dir); fs.mkdirSync(out, { recursive: true });
const sha = b => createHash('sha256').update(b).digest('hex');
const write = (name, value) => {
  const b = JSON.stringify(value, null, 2);
  for (const d of [dir, out]) fs.writeFileSync(path.join(d, name), b, { flag: 'wx' });
};
const sources = ['01-fal-input.png', '05-fal-input.png', '01-before-dispatch.json', '05-before-dispatch.json', '01-result.json', '05-result.json', 'pilot-result.json', '01-comparison.jpg', '05-comparison.jpg'];
const evidence = sources.map(file => { const b = fs.readFileSync(path.join(pilot.dir, file)); return { file, bytes: b.length, sha256: sha(b) }; });
write('review-manifest.json', { id, dir, out, priorPilotId: pilot.id, createdAt: new Date().toISOString(), timezone: 'Asia/Baghdad', additionalInferenceCalls: 0, priorEvidence: evidence });
process.env.NODE_PATH = pilot.dist + path.delimiter + path.join(root, 'node_modules'); require('node:module').Module._initPaths();
const { falStudioRequest } = require(path.join(pilot.dist, 'src/image-enhancement/fal-studio.provider.js'));
const { CATALOG_STUDIO_V1 } = require(path.join(pilot.dist, 'src/image-enhancement/brand-studio.config.js'));
const sharp = require('sharp');
(async () => {
  const requests = [];
  for (const n of ['01', '05']) {
    const png = fs.readFileSync(path.join(pilot.dir, n + '-fal-input.png')), m = await sharp(png, { failOn: 'warning', limitInputPixels: 1048576 }).metadata();
    await sharp(png, { failOn: 'warning', limitInputPixels: 1048576 }).raw().toBuffer();
    const input = falStudioRequest(png, CATALOG_STUDIO_V1), decoded = Buffer.from(input.image_urls[0].split(',')[1], 'base64');
    assert.deepEqual(decoded, png);
    requests.push({ n: Number(n), model: pilot.primaryModel, reconstructionBasis: 'Immutable runtime function plus exact saved provider-input PNG; original wire JSON was not retained',
      contentType: 'application/json', imageDataUriMime: 'image/png', pngSignatureValid: png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
      canonicalBase64: decoded.toString('base64') === input.image_urls[0].split(',')[1], imageBytes: png.length, imageDataUriCharacters: input.image_urls[0].length,
      fullyDecoded: true, metadata: { width: m.width, height: m.height, format: m.format, pages: m.pages ?? 1, hasAlpha: m.hasAlpha },
      jsonBytes: Buffer.byteLength(JSON.stringify(input)), reconstructedBodySha256: sha(JSON.stringify(input)),
      schemaValuesWithoutImage: { ...input, prompt: { characters: input.prompt.length, sha256: sha(input.prompt) }, system_prompt: { characters: input.system_prompt.length, sha256: sha(input.system_prompt) }, image_urls: { count: 1, inline: true, imageSha256: sha(png) } } });
  }
  write('request-format-review.json', { requests, inferenceCalls: 0 });
  // Public, credential-free schema request; cannot reach fal.run or queue inference APIs.
  const url = 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=google/nano-banana-lite/edit';
  let schema;
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (r.ok) {
      const bytes = Buffer.from(await r.arrayBuffer()); assert.ok(bytes.length < 2 * 1024 * 1024);
      const json = JSON.parse(bytes.toString('utf8'));
      write('public-openapi-schema.json', json);
      schema = { httpStatus: r.status, url, bytes: bytes.length, sha256: sha(bytes) };
    } else { await r.body?.cancel(); schema = { httpStatus: r.status, url }; }
  } catch { schema = { url, state: 'PUBLIC_SCHEMA_UNAVAILABLE' }; }
  write('schema-fetch.json', schema);
  console.log(JSON.stringify({ reviewId: id, dir, out, schema, requestImages: requests.map(r => ({ n: r.n, bytes: r.imageBytes, metadata: r.metadata })), additionalInferenceCalls: 0 }));
})().catch(() => { console.error('OFFLINE_FAL_REVIEW_REQUIRES_INSPECTION'); process.exitCode = 1; });
