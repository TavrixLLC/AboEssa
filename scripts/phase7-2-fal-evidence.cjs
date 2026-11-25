// Seal only non-secret pilot metadata/source hashes. Private configuration is never copied.
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'), base = 'D:/rezona-phase7-2-qa/fal-pilot';
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'pilot-manifest.json'), 'utf8'));
if (!/^[a-f0-9]{8}$/.test(manifest.id)) throw Error('Invalid local pilot manifest');
const key = require('dotenv').parse(fs.readFileSync(path.join(base, 'backend.env'))).FAL_KEY;
if (!key) throw Error('Key presence required for private no-leak check');
const sources = ['.gitignore', '.env.phase7-2-fal.example',
  'src/image-enhancement/fal-studio.config.ts', 'src/image-enhancement/fal-studio.provider.ts',
  'src/image-enhancement/brand-studio.config.ts', 'src/image-enhancement/enhancement.provider.ts',
  'src/image-enhancement/gemini-studio.provider.ts', 'src/image-enhancement/enhancement.service.ts',
  'src/ai/recognition-budget.service.ts', 'tests/unit/fal-brand-studio.spec.ts',
  'scripts/phase7-2-fal-preflight.cjs', 'scripts/phase7-2-fal-pilot.cjs',
  'scripts/phase7-2-fal-postflight.cjs', 'scripts/phase7-2-fal-evidence.cjs',
  'docs/rezona-phase-7-2-fal-pilot.md'];
const evidence = fs.readdirSync(manifest.out).filter(n => /\.(json|log)$/.test(n)).map(n => path.relative(root, path.join(manifest.out, n)));
const rows = [...sources, ...evidence].map(rel => {
  const bytes = fs.readFileSync(path.join(root, rel));
  if (bytes.includes(Buffer.from(key))) throw Error('PRIVATE_KEY_LEAK_SCAN_FAILED');
  return { file: rel.replace(/\\/g, '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
// Scan all repository-local text source/document/script artifacts, including Flutter,
// without printing matches or values. Dependency/build/VCS trees are excluded.
let scanned = 0;
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build', '.dart_tool', '.gradle', 'coverage', '.idea', 'Pods', '.pub-cache'].includes(entry.name)) scan(p);
    } else if (/\.(ts|js|cjs|mjs|json|md|dart|env|yaml|yml|txt|log|html)$/.test(entry.name) || entry.name.startsWith('.env')) {
      const stat = fs.statSync(p); if (stat.size > 10 * 1024 * 1024) continue;
      scanned++;
      if (fs.readFileSync(p).includes(Buffer.from(key))) throw Error('PRIVATE_KEY_LEAK_SCAN_FAILED');
    }
  }
}
scan(root); scan(path.resolve(root, '../AboEssaMobile'));
const report = { createdAt: new Date().toISOString(), pilotId: manifest.id, sourceAndEvidence: rows,
  privateKeyValueDetected: false, sourceTextFilesScanned: scanned,
  immutableRuntimeNote: 'Initial isolated dist snapshot built before the lint-only empty-catch comment; no live rerun or rebuild occurred after spending. Reports and postflight tools are later audit additions.',
  noDeploy: true, noGitPush: true, realInferenceCalls: 2, furtherPaidCallsAuthorizedByThisFile: false };
const dest = path.join(manifest.out, 'evidence-' + Date.now() + '.json');
fs.writeFileSync(dest, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ sealed: true, records: rows.length, scanned, keyValueDetected: false, evidence: dest }));
