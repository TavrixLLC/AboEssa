// Evidence-only release review. No SSH, deploy, migration, Docker start/stop,
// device install, paid inference, credential access or publication capability.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const https = require('node:https');
const root = path.resolve(__dirname, '..');
const mobile = path.resolve(root, '../AboEssaMobile');
const base = 'D:/rezona-phase9-review';
const previous = path.join(root, 'docs/benchmarks/admin-production-hardening/130f0653');
const hash = b => createHash('sha256').update(b).digest('hex');
const json = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const save = (p, x) => fs.writeFileSync(p, typeof x === 'string' ? x : JSON.stringify(x, null, 2), { flag: 'wx' });
const env = { ...process.env };
for (const k of Object.keys(env)) {
  // Remove the whole injected Git config tuple, never KEY without COUNT/VALUE.
  if (/^GIT_CONFIG_|KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|REDIS_URL|QA_.*URL|NODE_OPTIONS/i.test(k)) delete env[k];
}
const run = (exe, args, cwd = root, extra = {}, timeout = 90000) => spawnSync(exe, args, {
  cwd, env: { ...env, ...extra }, windowsHide: true, encoding: 'utf8', timeout,
  maxBuffer: 32 * 1024 * 1024,
});
function snapshot(repo) {
  const r = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], repo);
  assert.equal(r.status, 0);
  const files = [...new Set(r.stdout.split('\0').filter(Boolean))]
    .filter(n => !/^((node_modules|build|backups|uploads|tools|\.git)(\/|$))|(^|\/)(\.env(?:\..*)?|key\.properties|local\.properties)$|\.(?:jks|keystore|p12|pem|key|dpapi)$/.test(n))
    .filter(n => fs.existsSync(path.join(repo, n)) && fs.statSync(path.join(repo, n)).isFile())
    .map(n => ({ path: n, sha256: hash(fs.readFileSync(path.join(repo, n))) }));
  return { head: run('git', ['rev-parse', 'HEAD'], repo).stdout.trim(), files };
}
function verifySeal() {
  const seal = json(path.join(previous, 'evidence-seal.json'));
  const changes = [];
  for (const [dir, items] of [[previous, seal.evidence], [root, seal.docs]]) {
    for (const item of items) {
      const p = path.join(dir, item.path);
      if (!fs.existsSync(p) || hash(fs.readFileSync(p)) !== item.sha256) changes.push(item.path);
    }
  }
  return { checked: seal.evidence.length + seal.docs.length, passed: changes.length === 0, changes,
    sealSha256: hash(fs.readFileSync(path.join(previous, 'evidence-seal.json'))) };
}
const reports = ['rezona-phase-9-production-launch.md', 'rezona-phase-9-cutover-checklist.md',
  'rezona-phase-9-post-launch-monitoring.md', 'rezona-protected-staging-acceptance.md'];
async function hashFile(file) {
  const h = createHash('sha256');
  for await (const b of fs.createReadStream(file)) h.update(b);
  return h.digest('hex');
}
function tlsProbe() {
  return new Promise(resolve => {
    const start = Date.now();
    const req = https.get('https://shanasheel.tavrixllc.com/ready', { timeout: 12000 }, res => {
      const cert = res.socket.getPeerCertificate();
      const result = { at: new Date().toISOString(), target: 'EXISTING_PRODUCTION_READINESS_GET_ONLY',
        status: res.statusCode, tlsAuthorized: res.socket.authorized, protocol: res.socket.getProtocol(),
        certificateExpiry: cert.valid_to, hstsPresent: !!res.headers['strict-transport-security'],
        durationMs: Date.now() - start, stagingAcceptance: false, bodyRecorded: false };
      res.resume(); res.on('end', () => resolve(result));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('Timeout'), { code: 'TIMEOUT' })));
    req.on('error', e => resolve({ at: new Date().toISOString(), errorCode: e.code || 'NETWORK_ERROR',
      durationMs: Date.now() - start, stagingAcceptance: false, bodyRecorded: false }));
  });
}
async function review() {
  const id = randomUUID().slice(0, 8);
  const dir = path.join(base, 'run-' + id);
  const out = path.join(root, 'docs/benchmarks/phase9-release-review', id);
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(out, { recursive: true });
  const m = { id, dir, out, at: new Date().toISOString(), timezone: 'Asia/Baghdad',
    kind: 'PHASE9_READINESS_REVIEW_NOT_RELEASE_AUTHORIZATION', productionGo: false,
    previousEvidence: 'admin-production-hardening/130f0653', stagingReportPresentAtStart:
      fs.existsSync(path.join(root, 'docs/rezona-protected-staging-acceptance.md')) };
  save(path.join(dir, 'manifest.json'), m); save(path.join(out, 'manifest.json'), m);
  save(path.join(dir, 'source-before.json'), { backend: snapshot(root), mobile: snapshot(mobile) });
  console.log(JSON.stringify({ started: true, manifest: path.join(dir, 'manifest.json') }));
  save(path.join(out, 'historical-evidence-integrity.json'), verifySeal());
  const artifact = json(path.join(previous, 'backend-image-artifact.json'));
  const apk = json(path.join(previous, 'signed-admin-artifact.json'));
  const source = json(path.join(previous, 'source-candidate-v2.json'));
  const artifacts = [];
  for (const [kind, file, expected] of [['backend-image-archive', artifact.file, artifact.sha256],
    ['backend-source', source.file, source.sha256], ['admin-apk', apk.apk, apk.sha256]]) {
    const actual = await hashFile(file);
    artifacts.push({ kind, file, bytes: fs.statSync(file).size, expectedSha256: expected,
      actualSha256: actual, passed: actual === expected });
  }
  const image = run('docker', ['image', 'inspect', 'rezona-admin-rc:130f0653-v2', '--format', '{{json .}}']);
  let identity = { verified: false, errorCode: 'LOCAL_DOCKER_UNAVAILABLE' };
  if (image.status === 0) {
    const i = JSON.parse(image.stdout);
    const savedManifest = run('tar.exe', ['-xOf', artifact.file, 'manifest.json']);
    assert.equal(savedManifest.status, 0);
    const archiveConfig = JSON.parse(savedManifest.stdout)[0].Config;
    const configBytes = run('tar.exe', ['-xOf', artifact.file, archiveConfig]);
    assert.equal(configBytes.status, 0);
    identity = { verified: i.Id === artifact.digest, imageId: i.Id, repoDigests: i.RepoDigests,
      user: i.Config.User, architecture: i.Architecture, os: i.Os,
      archiveConfigDigest: 'sha256:' + path.posix.basename(archiveConfig),
      note: 'Docker-reported image identity is verified locally. Archive Config digest is distinct. No registry upload or remote registry pull validation occurred; deliver the verified image archive, not an assumed remote pull reference.' };
  }
  const listing = run('tar.exe', ['-tf', source.file]); assert.equal(listing.status, 0);
  const context = path.join(path.dirname(source.file), 'linux-context-v2');
  const differences = [], archiveFiles = listing.stdout.split(/\r?\n/).filter(n => n && !n.endsWith('/'));
  for (const n of archiveFiles) {
    assert.ok(!n.startsWith('/') && !n.split('/').includes('..'));
    const p = path.join(root, n), old = path.join(context, n);
    if (!fs.existsSync(p) || !fs.existsSync(old) || hash(fs.readFileSync(p)) !== hash(fs.readFileSync(old))) differences.push(n);
  }
  const currentFiles = [];
  const visit = rel => {
    const p = path.join(root, rel);
    if (fs.statSync(p).isDirectory()) for (const n of fs.readdirSync(p)) visit(rel + '/' + n);
    else currentFiles.push(rel);
  };
  source.contents.forEach(visit);
  const addedToReleaseScope = currentFiles.filter(n => !archiveFiles.includes(n));
  const oldSnapshot = json(path.join(previous, 'source-current-1795542700106.json'));
  const mobileChanges = oldSnapshot.mobile.files.filter(f => !fs.existsSync(path.join(mobile, f.path)) ||
    hash(fs.readFileSync(path.join(mobile, f.path))) !== f.sha256).map(f => f.path);
  const oldMobilePaths = new Set(oldSnapshot.mobile.files.map(f => f.path));
  const mobileAdded = snapshot(mobile).files.filter(f => !oldMobilePaths.has(f.path)).map(f => f.path);
  save(path.join(out, 'artifact-reverification.json'), { artifacts, identity, sourceArchiveFiles: archiveFiles.length,
    backendSourceDifferences: differences, addedToReleaseScope, mobileChanges, mobileAdded,
    mobileBaseline: 'Latest hardening file-hash snapshot, not Git HEAD alone',
    sourceMatches: !differences.length && !addedToReleaseScope.length && !mobileChanges.length && !mobileAdded.length,
    apkPhysicalAcceptance: 'NOT_VERIFIED', newBuildCreated: false });
  const sign = run('cmd.exe', ['/d', '/c', 'C:/Users/3ma/AppData/Local/Android/Sdk/build-tools/37.0.0/apksigner.bat',
    'verify', '--verbose', '--print-certs', apk.apk], root,
    { JAVA_HOME: 'C:/Program Files/Android/Android Studio/jbr' });
  const cert = sign.stdout?.match(/certificate SHA-256 digest:\s*([a-f0-9]+)/i)?.[1]?.toLowerCase();
  save(path.join(out, 'apk-signature-reverification.json'), { at: new Date().toISOString(), exitCode: sign.status,
    passed: sign.status === 0 && cert === apk.certificateSha256, certificateSha256: cert || null,
    expectedCertificateSha256: apk.certificateSha256,
    signatureV2: /Verified using v2 scheme.*true/i.test(sign.stdout || ''),
    deviceAcceptance: 'NOT_VERIFIED', installed: false });
  const audit = json(path.join(previous, 'ssh-audit-1795540340071.json'));
  const start = audit.output.indexOf('[{"migration_name"');
  const applied = JSON.parse(audit.output.slice(start, audit.output.indexOf(']\n', start) + 1));
  const appliedByName = new Map(applied.map(x => [x.migration_name, x]));
  const migrations = fs.readdirSync(path.join(root, 'prisma/migrations')).filter(n => fs.existsSync(path.join(root, 'prisma/migrations', n, 'migration.sql'))).sort().map(id => {
    const bytes = fs.readFileSync(path.join(root, 'prisma/migrations', id, 'migration.sql'));
    const sql = bytes.toString('utf8');
    return { id, sha256: hash(bytes), bytes: bytes.length, appliedAtLastObservation: appliedByName.has(id),
      historicalRecordedChecksum: appliedByName.get(id)?.checksum || null,
      checksumMatchesHistoricalObservation: appliedByName.has(id) ? hash(bytes) === appliedByName.get(id).checksum : null,
      markers: { alterTable: /ALTER\s+TABLE/i.test(sql), rowUpdate: /\bUPDATE\s+"/i.test(sql),
        createIndex: /CREATE\s+(UNIQUE\s+)?INDEX/i.test(sql), concurrentIndex: /CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(sql),
        triggerOrFunction: /CREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|TRIGGER|CONSTRAINT\s+TRIGGER)/i.test(sql),
        drop: /\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|TYPE|TRIGGER|FUNCTION)/i.test(sql) } };
  });
  save(path.join(out, 'migration-manifest.json'), { observedAt: audit.at, currentProductionRequeried: false,
    sourceCount: migrations.length, lastObservedApplied: applied.length,
    pendingRelativeToLastObservation: migrations.filter(x => !x.appliedAtLastObservation).map(x => x.id),
    historicalChecksumDisposition: 'UNRESOLVED_NO_METADATA_REPAIR', migrations,
    measuredProtectedStagingDurationMs: null, liveLockDurationsMs: null, safeMaintenanceWindowMinutes: null,
    rehearsalBoundary: 'Prior local diagnostic copy only; NOT protected staging acceptance' });
  save(path.join(out, 'current-production-tls-probe.json'), await tlsProbe());
  for (const omit of [false, true]) {
    const began = Date.now();
    const r = run('cmd.exe', ['/d', '/s', '/c', 'npm audit --json' + (omit ? ' --omit=dev' : '')], root,
      { npm_config_fetch_timeout: '15000', npm_config_fetch_retries: '0' });
    let parsed; try { parsed = JSON.parse(r.stdout); } catch { parsed = { error: { code: 'AUDIT_JSON_UNAVAILABLE' } }; }
    save(path.join(out, omit ? 'audit-production.json' : 'audit-all.json'), parsed);
    const summary = { omitDevelopment: omit, at: new Date().toISOString(), exitCode: r.status,
      durationMs: Date.now() - began, vulnerabilities: parsed.metadata?.vulnerabilities || null,
      errorCode: parsed.error?.code || r.error?.code || null, upgradesPerformed: false };
    save(path.join(out, omit ? 'audit-production-summary.json' : 'audit-all-summary.json'), summary);
    console.log(JSON.stringify(summary));
  }
  const testStart = Date.now();
  const tests = run(process.execPath, ['node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath',
    'tests/unit/admin-production-release.spec.ts', 'tests/unit/minio-s3-storage.spec.ts',
    'tests/unit/dependency-security.spec.ts', 'tests/unit/fal-error-diagnostics.spec.ts'], root,
    { NODE_ENV: 'test', PRODUCT_STUDIO_DISPATCH_ENABLED: 'false',
      NODE_OPTIONS: '--require ' + path.join(root, 'scripts/studio20-network-fence.cjs') }, 180000);
  const log = (tests.stdout || '') + '\n' + (tests.stderr || '');
  save(path.join(out, 'targeted-offline-tests.log'), log);
  save(path.join(out, 'targeted-offline-tests.json'), { at: new Date().toISOString(), passed: tests.status === 0,
    exitCode: tests.status, durationMs: Date.now() - testStart, errorCode: tests.error?.code || null,
    boundary: 'Focused source checks only; no fresh commerce/staging/device acceptance', paidCalls: 0,
    tail: log.trim().split(/\r?\n/).slice(-10) });
  console.log(JSON.stringify({ id, out, privateManifest: path.join(dir, 'manifest.json'),
    sourceMatches: !differences.length && !addedToReleaseScope.length && !mobileChanges.length && !mobileAdded.length,
    testsPassed: tests.status === 0, verdict: 'NO_GO_STAGING_NOT_ACCEPTED' }));
}
function seal(manifestPath) {
  const m = json(manifestPath);
  assert.ok(path.resolve(m.dir).startsWith(path.resolve(base) + path.sep));
  assert.equal(path.resolve(m.out), path.join(root, 'docs/benchmarks/phase9-release-review', m.id));
  const before = json(path.join(m.dir, 'source-before.json')), changed = [];
  for (const [name, repo] of [['backend', root], ['mobile', mobile]]) for (const f of before[name].files) {
    if (!fs.existsSync(path.join(repo, f.path)) || hash(fs.readFileSync(path.join(repo, f.path))) !== f.sha256)
      changed.push(name + ':' + f.path);
  }
  assert.equal(changed.length, 0, 'Existing file changed during evidence-only review');
  const oldEvidence = verifySeal(); assert.ok(oldEvidence.passed);
  const a = json(path.join(m.out, 'artifact-reverification.json'));
  const evidence = fs.readdirSync(m.out).sort().map(n => ({ path: n, sha256: hash(fs.readFileSync(path.join(m.out, n))) }));
  const docs = reports.map(n => ({ path: 'docs/' + n, sha256: hash(fs.readFileSync(path.join(root, 'docs', n))) }));
  save(path.join(m.out, 'review-seal.json'), { at: new Date().toISOString(), kind: 'HASH_INVENTORY_NOT_DIGITAL_SIGNATURE',
    evidence, docs, historicalEvidenceUnchanged: oldEvidence.passed, inheritedFilesUnchanged: true,
    artifactsMatch: a.artifacts.every(x => x.passed), sourceMatches: a.sourceMatches,
    verdict: 'NO_GO', productionMutations: 0, paidCalls: 0, gitPush: false, deviceInstall: false });
  console.log(JSON.stringify({ sealed: true, inheritedFilesUnchanged: true, historicalEvidenceUnchanged: true, verdict: 'NO_GO' }));
}
if (process.argv[2] === 'seal') seal(process.argv[3]);
else if (process.argv[2] === 'review') review().catch(e => { console.error(e.code || e.message); process.exitCode = 1; });
else throw Error('Use review (new no-overwrite run) or seal <private manifest>');
