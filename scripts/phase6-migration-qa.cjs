if (process.env.REZONA_PHASE6_QA !== '1') throw Error('Explicit isolated Phase 6 QA required');
const { spawnSync } = require('node:child_process'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function run(exe, args, input) {
  const r = spawnSync(exe, args, {
    cwd: root,
    input,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (r.status !== 0) throw Error((r.stderr || r.stdout).slice(0, 1500));
  return r.stdout;
}
function sql(database, query) {
  if (!['rezona_phase6_upgrade', 'rezona_phase6_fresh'].includes(database))
    throw Error('Invalid QA database');
  return run('docker', [
    'exec',
    '-i',
    'rezona-phase6-qa-postgres',
    'psql',
    '-U',
    'phase6_qa',
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-Atc',
    query,
  ]).trim();
}
function migrate(database) {
  if (!['rezona_phase6_upgrade', 'rezona_phase6_fresh'].includes(database))
    throw Error('Invalid target');
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://phase6_qa:phase6-local-only@127.0.0.1:55448/${database}`,
      },
    },
  );
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  return result.stdout;
}
const targets = ['rezona_phase6_upgrade', 'rezona_phase6_fresh'];
for (const name of targets) {
  const exists = run('docker', [
    'exec',
    'rezona-phase6-qa-postgres',
    'psql',
    '-U',
    'phase6_qa',
    '-d',
    'postgres',
    '-Atc',
    `SELECT 1 FROM pg_database WHERE datname='${name}'`,
  ]).trim();
  if (exists) throw Error(`QA target ${name} already exists; refusing overwrite`);
  run('docker', ['exec', 'rezona-phase6-qa-postgres', 'createdb', '-U', 'phase6_qa', name]);
}
// Only pg_dump on protected Phase 5: read-only source. All restore/migration writes stay in new Phase 6 DBs.
const dump = run('docker', [
  'exec',
  'rezona-phase5-qa-postgres',
  'pg_dump',
  '-U',
  'phase5_qa',
  '-d',
  'rezona_phase5_qa',
  '--no-owner',
  '--no-acl',
]);
run(
  'docker',
  [
    'exec',
    '-i',
    'rezona-phase6-qa-postgres',
    'psql',
    '-U',
    'phase6_qa',
    '-d',
    'rezona_phase6_upgrade',
    '-v',
    'ON_ERROR_STOP=1',
  ],
  dump,
);
const tables = sql(
  'rezona_phase6_upgrade',
  "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename",
).split('\n');
const fingerprints = () =>
  Object.fromEntries(
    tables.map((table) => {
      if (!/^[A-Za-z0-9_]+$/.test(table)) throw Error('Unexpected table');
      const result = sql(
        'rezona_phase6_upgrade',
        `SELECT count(*)||':'||COALESCE(md5(string_agg(h,'' ORDER BY h)),'empty') FROM (SELECT md5(row_to_json(t)::text) h FROM "${table}" t) rows`,
      );
      return [table, result];
    }),
  );
const before = fingerprints();
const upgradeLog = migrate('rezona_phase6_upgrade'),
  after = fingerprints();
assert.deepEqual(after, before);
const freshLog = migrate('rezona_phase6_fresh');
const count = (name) =>
  Number(sql(name, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'));
assert.equal(count('rezona_phase6_upgrade'), 35);
assert.equal(count('rezona_phase6_fresh'), 35);
for (const target of targets)
  assert.equal(
    sql(
      target,
      "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('ProductRecognitionTask','ProductRecognitionRequest','RecognitionUsage','IntakeDuplicateDecision')",
    ),
    '4',
  );
const result = {
  time: new Date().toISOString(),
  passed: true,
  scope:
    'Fresh 35 migrations and protected Phase5 read-only clone 32→35; writes only Phase6 databases',
  legacyTablesCompared: tables.length,
  fingerprintsUnchanged: true,
  before,
  after,
  migrations: { fresh: 35, upgrade: 35 },
  upgradeLog,
  freshLog,
};
fs.mkdirSync(path.join(root, 'docs/benchmarks/phase6'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'docs/benchmarks/phase6/migrations.json'),
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify({
    passed: true,
    legacyTablesCompared: tables.length,
    fingerprintsUnchanged: true,
    migrations: result.migrations,
  }),
);
