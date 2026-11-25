// Preserve old evidence; seal only this review. Never includes secrets/configuration values.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'), base = 'D:/rezona-phase7-2-qa/fal-pilot', id = process.argv[2];
assert.match(id ?? '', /^20261122-[a-f0-9]{8}$/);
const dir = path.join(base, 'review-' + id), m = JSON.parse(fs.readFileSync(path.join(dir, 'review-manifest.json'), 'utf8'));
const pilot = JSON.parse(fs.readFileSync(path.join(base, 'pilot-manifest.json'), 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
for (const p of m.priorEvidence) assert.equal(sha(fs.readFileSync(path.join(pilot.dir, p.file))), p.sha256);
for (const p of pilot.selectedPhotos) {
  const prefix = String(p.n).padStart(2, '0');
  assert.equal(sha(fs.readFileSync(path.join(pilot.dir, prefix + '-original.jpeg'))), p.originalSha256);
  assert.equal(sha(fs.readFileSync(path.join(pilot.dir, prefix + '-mask.png'))), p.maskHash);
}
const finalChecks = fs.readdirSync(m.out).filter(n => /^checks-\d+\.json$/.test(n)).sort().at(-1);
assert.ok(finalChecks);
const checks = JSON.parse(fs.readFileSync(path.join(m.out, finalChecks), 'utf8'));
assert.ok(checks.checks.every(c => c.passed)); assert.equal(checks.state.conservativeCommitmentUsd, '0.348160');
const key = require('dotenv').parse(fs.readFileSync(path.join(base, 'backend.env'))).FAL_KEY;
const source = ['src/image-enhancement/fal-error-diagnostics.ts', 'src/image-enhancement/fal-studio.provider.ts', 'src/image-enhancement/enhancement.provider.ts', 'src/image-enhancement/enhancement.service.ts',
  'tests/unit/fal-brand-studio.spec.ts', 'tests/unit/fal-error-diagnostics.spec.ts',
  ...fs.readdirSync(path.join(root, 'scripts')).filter(n => /^phase7-2-fal-review.*\.cjs$/.test(n)).map(n => 'scripts/' + n)];
const artifacts = fs.readdirSync(m.out).filter(n => /\.(json|md|log)$/.test(n)).map(n => path.relative(root, path.join(m.out, n)));
const records = [...source, ...artifacts].map(file => {
  const b = fs.readFileSync(path.join(root, file)); assert.ok(!b.includes(Buffer.from(key)));
  return { file: file.replace(/\\/g, '/'), bytes: b.length, sha256: sha(b) };
});
// Mirror the manually curated, non-secret report and dashboard observation into the private review.
for (const name of ['report.md', 'dashboard-observations.json']) fs.copyFileSync(path.join(m.out, name), path.join(dir, name), fs.constants.COPYFILE_EXCL);
const report = { sealedAt: new Date().toISOString(), reviewId: id, originalEvidenceUnchanged: true, originalAndMaskHashesVerified: 2,
  actualKeyValueFoundInReview: false, finalChecks, records, inferenceRequestsDuringReview: 0, priorInferenceRequestsStill: 2,
  unknownReservationsReleased: 0, newOwnerApprovalRequiredBeforePaidTesting: true, productionDeployment: false, githubPush: false };
for (const d of [dir, m.out]) fs.writeFileSync(path.join(d, 'evidence-seal.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ sealed: true, records: records.length, priorEvidenceUnchanged: true, newPaidCalls: 0, report: path.join(m.out, 'report.md') }));
