// Deterministic local control only, using preserved capture/mask. NO provider transport.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), base = 'D:/rezona-phase7-2-qa/fal-pilot', id = process.argv[2];
assert.match(id ?? '', /^20261122-[a-f0-9]{8}$/);
const dir = path.join(base, 'review-' + id), m = JSON.parse(fs.readFileSync(path.join(dir, 'review-manifest.json'), 'utf8'));
const pilot = JSON.parse(fs.readFileSync(path.join(base, 'pilot-manifest.json'), 'utf8'));
process.env.NODE_PATH = pilot.dist + path.delimiter + path.join(root, 'node_modules'); require('node:module').Module._initPaths();
const { studioCodec } = require(path.join(pilot.dist, 'src/image-enhancement/brand-studio-codec.js'));
const { CATALOG_STUDIO_V1 } = require(path.join(pilot.dist, 'src/image-enhancement/brand-studio.config.js'));
const sharp = require('sharp');
(async () => {
  const source = fs.readFileSync(path.join(pilot.dir, '01-original.jpeg')), mask = fs.readFileSync(path.join(pilot.dir, '01-mask.png'));
  const prior = JSON.parse(fs.readFileSync(path.join(pilot.dir, '01-result.json'), 'utf8'));
  const local = await studioCodec({ bytes: source, mime: 'image/jpeg', mask, mode: 'GEMINI_BRAND_STUDIO', background: 'WHITE', matting: false, studioProfile: CATALOG_STUDIO_V1 });
  assert.equal(local.details.foregroundHash, prior.expectedForegroundHash);
  fs.writeFileSync(path.join(dir, '01-local-neutral-control.png'), local.png, { flag: 'wx' });
  const plate = fs.readFileSync(path.join(pilot.dir, '01-fal-output.png')), fal = fs.readFileSync(path.join(pilot.dir, '01-composited.png'));
  const label = t => Buffer.from(`<svg width="1024" height="85"><rect width="1024" height="85" fill="#111818"/><text x="24" y="52" font-family="Arial" font-size="28" fill="#E7BC61">${t}</text></svg>`);
  const board = await sharp({ create: { width: 3072, height: 1109, channels: 3, background: '#111818' } }).composite([
    { input: label('Local neutral control - no AI'), top: 0, left: 0 },
    { input: label('fal empty plate - no product pixels'), top: 0, left: 1024 },
    { input: label('fal + SAME preserved foreground'), top: 0, left: 2048 },
    { input: local.png, top: 85, left: 0 }, { input: plate, top: 85, left: 1024 }, { input: fal, top: 85, left: 2048 },
  ]).jpeg({ quality: 95 }).toBuffer();
  fs.writeFileSync(path.join(dir, '01-fair-local-vs-fal.jpg'), board, { flag: 'wx' });
  const report = { additionalInferenceCalls: 0, samePreparedForegroundHash: local.details.foregroundHash,
    foregroundMatchesPilot: true, generatedControlIsLocalFileOnlyNotApprovedOrSelected: true,
    privateComparison: path.join(dir, '01-fair-local-vs-fal.jpg') };
  for (const d of [dir, m.out]) fs.writeFileSync(path.join(d, 'visual-control.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(report));
})().catch(() => { console.error('LOCAL_VISUAL_CONTROL_FAILED'); process.exitCode = 1; });
