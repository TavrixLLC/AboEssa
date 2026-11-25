// Offline regression commands and READ ONLY inspection of the existing isolated pilot DB.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), id = process.argv[2]; assert.match(id ?? '', /^20261122-[a-f0-9]{8}$/);
const dir = path.join('D:/rezona-phase7-2-qa/fal-pilot', 'review-' + id), m = JSON.parse(fs.readFileSync(path.join(dir, 'review-manifest.json'), 'utf8'));
const suffix = Date.now(), checks = [];
for (const [name, args] of [
  ['unit', ['node_modules/jest/bin/jest.js', 'tests/unit', '--runInBand']],
  ['lint', ['node_modules/eslint/bin/eslint.js', 'src/image-enhancement/*.ts', 'tests/unit/fal-*.spec.ts']],
  ['typecheck', ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false']],
]) {
  const r = spawnSync(process.execPath, args, { cwd: root, env: { ...process.env, FAL_BRAND_STUDIO_ENABLED: 'false', GEMINI_BRAND_STUDIO_ENABLED: 'false' }, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  const log = (r.stdout ?? '') + '\n' + (r.stderr ?? ''), file = name + '-' + suffix + '.log';
  for (const d of [dir, m.out]) fs.writeFileSync(path.join(d, file), log, { flag: 'wx' });
  checks.push({ name, passed: r.status === 0, log: file });
  console.log(JSON.stringify({ name, passed: r.status === 0, summary: log.trim().split(/\r?\n/).slice(-6) }));
  if (r.status !== 0) process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync('D:/rezona-phase7-2-qa/20261122-6470081b/runtime-secrets.json', 'utf8'));
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: `postgresql://phase72_qa:${encodeURIComponent(cfg.postgresPassword)}@127.0.0.1:55454/rezona_phase72_fal_84a2de4a` } }, log: [] });
(async () => {
  const state = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const ledger = await tx.recognitionUsage.findMany({ select: { enhancementJobId: true, status: true, committedUsd: true, reservedUsd: true, estimatedUsd: true, actualBilledUsd: true } });
    assert.equal(ledger.length, 2); assert.equal(ledger.filter(r => r.status === 'UNKNOWN').length, 1);
    assert.ok(ledger.every(r => r.committedUsd.toString() === '0.17408' && r.actualBilledUsd === null));
    const jobs = await tx.productImageEnhancementJob.findMany({ where: { provider: 'fal' }, select: { id: true, status: true, generation: true, attempts: true, providerRequestId: true } });
    assert.equal(jobs.length, 2); assert.ok(jobs.every(j => j.generation === 0 && j.attempts === 1));
    const count = await tx.productListing.count(); assert.equal(count, 0);
    return { readOnly: true, ledger, jobs, conservativeCommitmentUsd: '0.348160', actualLedgerTotalUsd: null, actualChargesNotBackfilled: true, noNewProducts: count === 0 };
  });
  const report = { checkedAt: new Date().toISOString(), checks, state, additionalInferenceCalls: 0, noDeployment: true, noGithubPush: true };
  for (const d of [dir, m.out]) fs.writeFileSync(path.join(d, 'checks-' + suffix + '.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ passed: true, unchangedCommitment: state.conservativeCommitmentUsd, unknownReservationsReleased: 0, newPaidRequests: 0 }));
})().catch(() => { console.error('READ_ONLY_REVIEW_CHECK_FAILED'); process.exitCode = 1; }).finally(() => db.$disconnect());
