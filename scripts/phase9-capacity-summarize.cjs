// Parse already collected passive evidence only; no network or process control.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const parent = path.join(root, 'docs/benchmarks/phase9-capacity');
const primary = path.join(parent, 'f97dd80b'), followup = path.join(parent, '450ab1c1');
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const save = (name, x) => fs.writeFileSync(path.join(primary, name), JSON.stringify(x, null, 2), { flag: 'wx' });
function sections(s) {
  const parts = s.split(/\nSECTION ([a-z_]+)\n/), result = {};
  for (let i = 1; i < parts.length; i += 2) result[parts[i]] = parts[i + 1].trim();
  return result;
}
function memory(s) {
  const x = s.split('\n').find(s => s.startsWith('Mem:')).trim().split(/\s+/).slice(1).map(Number);
  return { totalBytes: x[0], usedBytes: x[1], freeBytes: x[2], sharedBytes: x[3], cacheBytes: x[4], availableBytes: x[5] };
}
const baseline = read(primary, 'baseline.json'), b = sections(baseline.output);
const samples = [1, 2, 3].map(i => ({ record: read(primary, `sample-${i}.json`) }));
const vmstat = [], memorySamples = [memory(b.memory)], pressure = [], containers = {}, ready = [], diskRates = [];
for (const sample of samples) {
  assert.ok(sample.record.passed && sample.record.hostKeyVerified);
  const s = sections(sample.record.output);
  memorySamples.push(memory(s.memory));
  const lines = s.vmstat.split('\n').map(s => s.trim()).filter(s => /^\d+\s/.test(s));
  // First vmstat row is since boot, not a two-second interval.
  for (const line of lines.slice(1)) {
    const x = line.split(/\s+/).map(Number);
    vmstat.push({ running: x[0], blocked: x[1], swapInKiBs: x[6], swapOutKiBs: x[7],
      userPct: x[12], systemPct: x[13], idlePct: x[14], ioWaitPct: x[15], stealPct: x[16] });
  }
  for (const line of s.pressure.split('\n')) {
    const m = line.match(/^(cpu|memory|io) some avg10=([\d.]+) avg60=([\d.]+) avg300=([\d.]+)/);
    if (m) pressure.push({ resource: m[1], avg10Pct: +m[2], avg60Pct: +m[3], avg300Pct: +m[4] });
  }
  for (const line of s.docker_stats.split('\n')) {
    const x = JSON.parse(line);
    (containers[x.Name] ||= { dockerSamples: [], cgroupSamples: [] }).dockerSamples.push(x);
  }
  const groups = s.cgroups.split(/\n?CONTAINER ([^\n]+)\n/);
  for (let i = 1; i < groups.length; i += 2) {
    const text = groups[i + 1], pick = name => text.match(new RegExp('(?:^|\\n)' + name.replace('.', '\\.') + '\\n([^\\n]+)'))?.[1];
    (containers[groups[i]] ||= { dockerSamples: [], cgroupSamples: [] }).cgroupSamples.push({
      memoryCurrentBytes: Number(pick('memory.current')), memoryPeakBytes: Number(pick('memory.peak')),
      memoryMax: pick('memory.max'), cpuMax: pick('cpu.max'),
      oom: Number(text.match(/\noom (\d+)/)?.[1]), oomKill: Number(text.match(/\noom_kill (\d+)/)?.[1]),
    });
  }
  const r = s.ready.match(/STATUS (\d+) TLS_VERIFY (\d+) TIME ([\d.]+)/);
  ready.push({ status: +r[1], tlsVerify: +r[2], seconds: +r[3] });
  // iostat first device report is since boot; ignore it for interval extrema.
  const reports = s.iostat.split(/Device\s+/).slice(2);
  for (const report of reports) for (const line of report.split('\n')) {
    if (!/^sda\s/.test(line)) continue;
    const x = line.trim().split(/\s+/);
    diskRates.push({ readsPerSecond: +x[1], writesPerSecond: +x[7], readAwaitMs: +x[5], writeAwaitMs: +x[11], utilizationPct: +x.at(-1) });
  }
}
assert.equal(vmstat.length, 15);
const before = JSON.parse(read(primary, 'postgres-before.json').output);
const after = JSON.parse(read(primary, 'postgres-after.json').output);
const redis = JSON.parse(read(followup, 'redis-followup.json').output); assert.ok(redis.available);
const continuity = read(followup, 'service-continuity.json');
assert.equal(b.limits.trim(), continuity.output.trim(), 'Container identities/start times/restart counts or limits changed');
const min = xs => Math.min(...xs), max = xs => Math.max(...xs), avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const disk = b.disk.split('\n').find(s => s.startsWith('/dev/')).trim().split(/\s+/);
const csummary = Object.fromEntries(Object.entries(containers).map(([name, c]) => [name, {
  memoryCurrentBytesRange: [min(c.cgroupSamples.map(x => x.memoryCurrentBytes)), max(c.cgroupSamples.map(x => x.memoryCurrentBytes))],
  peakBytesSinceContainerStart: max(c.cgroupSamples.map(x => x.memoryPeakBytes)),
  oom: max(c.cgroupSamples.map(x => x.oom)), oomKill: max(c.cgroupSamples.map(x => x.oomKill)),
  memoryMaxValues: [...new Set(c.cgroupSamples.map(x => x.memoryMax))],
  cpuMaxValues: [...new Set(c.cgroupSamples.map(x => x.cpuMax))],
  dockerCpuPctRange: [min(c.dockerSamples.map(x => parseFloat(x.CPUPerc))), max(c.dockerSamples.map(x => parseFloat(x.CPUPerc)))],
}]));
const historical = [
  ['docs/benchmarks/admin-production-hardening/130f0653', 'evidence-seal.json', 'evidence'],
  ['docs/benchmarks/phase9-release-review/0f3e402b', 'review-seal.json', 'evidence'],
].map(([dir, file, field]) => {
  const seal = read(path.join(root, dir), file), mismatches = [];
  for (const item of seal[field]) if (hash(path.join(root, dir, item.path)) !== item.sha256) mismatches.push(item.path);
  for (const item of seal.docs) if (hash(path.join(root, item.path)) !== item.sha256) mismatches.push(item.path);
  assert.equal(mismatches.length, 0);
  return { path: dir + '/' + file, sealSha256: hash(path.join(root, dir, file)), passed: true,
    referencedFilesChecked: seal[field].length + seal.docs.length };
});
const result = { at: new Date().toISOString(), timezone: 'Asia/Baghdad',
  observation: { primaryStartUtc: b.clock.split('\n')[0], primaryEndUtc: read(primary, 'collection-summary.json').at,
    followupEndUtc: continuity.at, vmstatIntervals: vmstat.length, intervalSeconds: 2, dockerSamplesPerContainer: 3,
    lifetimePeakBoundary: 'Since observed containers started 2026-11-24T16:57:13Z, not a historical business peak' },
  cpus: Number(b.cpu.split('\n')[0]), os: b.os, memory: { totalBytes: memorySamples[0].totalBytes,
    availableBytesRange: [min(memorySamples.map(x => x.availableBytes)), max(memorySamples.map(x => x.availableBytes))],
    usedBytesRange: [min(memorySamples.map(x => x.usedBytes)), max(memorySamples.map(x => x.usedBytes))], swapBytes: 0 },
  cpu: { idlePctRange: [min(vmstat.map(x => x.idlePct)), max(vmstat.map(x => x.idlePct))],
    meanIdlePct: avg(vmstat.map(x => x.idlePct)), maxIoWaitPct: max(vmstat.map(x => x.ioWaitPct)),
    maxStealPct: max(vmstat.map(x => x.stealPct)), maxRunnableProcesses: max(vmstat.map(x => x.running)) },
  pressureSamples: pressure,
  disk: { filesystemBytes: +disk[1], usedBytes: +disk[2], availableBytes: +disk[3],
    reportedUse: disk[4], observedIntervalRates: diskRates, throughputBenchmarkPerformed: false },
  containers: csummary, postgres: { before, after, physicalDatabaseByteChange: after.databaseBytes - before.databaseBytes,
    warning: 'n_live_tup estimates are not customer/business row counts; zero estimates do not establish empty tables' },
  redis, ready, serviceIdentitiesStartTimesAndRestartCountsUnchanged: true,
  earlierEvidence: historical, collectionCaveats: ['Initial Redis probes had no inherited URL; exit 0 was transport success, not Redis verification. Fixed-path secret-file authentication followup succeeded without recording the secret.',
    'Existing five default BullMQ contract counters only; no job payloads, queue constructor, scheduler, queue mutation or exhaustive queue discovery.',
    'No load/stress test, peak business-traffic trace, staging runtime or separation was created.',
    'Diagnostic reads add bounded CPU/IO and normal connection/stat/audit activity; zero means no intended application/config/schema mutations.'],
  verdict: 'CURRENT_HEADROOM_OBSERVED__SAME_SERVER_STAGING_NOT_CLEARED',
  stagingCapacityEnvelopeVerified: false, stagingIsolationEstablished: false, productionGo: false,
  reason: 'Current headroom is substantial, but worst-case new image/worker/restore load, limits and isolation are not accepted. Strict preflight requires confidence, not an idle-snapshot extrapolation.',
  recommendation: 'Do not provision staging on this read-only authorization. Prefer a separate staging server for isolation; same-server remains conditional on measured bounded resource design and isolation approval.',
  remoteFilesCreated: 0, deliberateProductionMutations: 0, serviceRestartsPerformed: 0, migrations: 0,
  paidCalls: 0, deployments: 0, stressTests: 0, cleanupOrPrune: 0 };
save('capacity-summary.json', result);
console.log(JSON.stringify({ verdict: result.verdict, cpus: result.cpus, totalGiB: result.memory.totalBytes / 2 ** 30,
  minAvailableGiB: result.memory.availableBytesRange[0] / 2 ** 30, diskAvailableGiB: result.disk.availableBytes / 2 ** 30,
  idlePctRange: result.cpu.idlePctRange, maxIoWaitPct: result.cpu.maxIoWaitPct,
  maxDiskUtilPct: max(diskRates.map(x => x.utilizationPct)), ready, containers: csummary, previousEvidenceUnchanged: true }));
