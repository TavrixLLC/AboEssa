// Read-only dump of the clean Phase4 rehearsal; writes only new Phase5 DB names.
if (process.env.REZONA_PHASE5_QA !== '1') throw Error('Explicit Phase5 QA flag required');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const container = 'rezona-phase5-qa-postgres',
  source = 'phase4_snapshot_1795115036343';
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { maxBuffer: 256 * 1024 * 1024, windowsHide: true, ...opts });
  if (r.status !== 0 || r.error) throw Error(r.error || r.stderr?.toString());
  return r.stdout;
}
const sql = (db, text) =>
  run(
    'docker',
    ['exec', container, 'psql', '-U', 'phase5_qa', '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atc', text],
    { encoding: 'utf8' },
  ).trim();
const tables = [
  'ProductListing',
  'Order',
  'OrderItem',
  'Auction',
  'Customer',
  'CustomerWallet',
  'WalletEntry',
  'InventoryBalance',
  'InventoryMovement',
  'InventoryOperation',
  'InventoryAllocation',
  'Warehouse',
  'WarehouseLocation',
  'FileAsset',
];
function fingerprint(db) {
  return Object.fromEntries(
    tables.map((t) => {
      const value = `(to_jsonb(t)${t === 'FileAsset' ? "-'intakePrivate'-'intakeProductId'" : ''})::text`;
      return [
        t,
        sql(
          db,
          `SELECT count(*)||':'||COALESCE(md5(string_agg(${value},'' ORDER BY ${value})),'empty') FROM "${t}" t`,
        ),
      ];
    }),
  );
}
const migrate = (db) =>
  run(
    process.execPath,
    [path.resolve(__dirname, '../node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://phase5_qa:phase5-local-only@127.0.0.1:55446/${db}`,
      },
    },
  );
const suffix = Date.now(),
  fresh = `phase5_fresh_${suffix}`,
  snapshot = `phase5_snapshot_${suffix}`;
for (const db of [fresh, snapshot]) {
  assert.match(db, /^phase5_(fresh|snapshot)_\d+$/);
  sql('postgres', `CREATE DATABASE ${db}`);
}
const freshLog = migrate(fresh);
const dump = run('docker', [
  'exec',
  'rezona-phase4-qa-postgres',
  'pg_dump',
  '-U',
  'phase4_qa',
  '-d',
  source,
  '-Fc',
]);
run(
  'docker',
  [
    'exec',
    '-i',
    container,
    'pg_restore',
    '--no-owner',
    '--no-privileges',
    '-U',
    'phase5_qa',
    '-d',
    snapshot,
  ],
  { input: dump },
);
const before = fingerprint(snapshot),
  prior = Number(
    sql(snapshot, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),
  );
assert.equal(prior, 31);
const upgradeLog = migrate(snapshot),
  after = fingerprint(snapshot);
assert.deepEqual(after, before);
const applied = Number(
  sql(snapshot, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),
);
assert.equal(applied, 32);
const result = {
  time: new Date().toISOString(),
  source: { container: 'rezona-phase4-qa-postgres', database: source, access: 'pg_dump read only' },
  fresh,
  snapshot,
  priorMigrations: prior,
  appliedMigrations: applied,
  before,
  after,
  businessFingerprintsUnchanged: true,
  freshLog,
  upgradeLog,
  passed: true,
};
const out = path.resolve(__dirname, '../docs/benchmarks/phase5');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'migration.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
