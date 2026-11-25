// Additive migration rehearsal only. The shared fixture is read by pg_dump;
// all restores/migrations/backfills target newly named Phase 4 disposable DBs.
if (process.env.REZONA_PHASE4_QA !== '1') throw Error('Explicit Phase 4 QA flag required');
const { spawnSync } = require('node:child_process');
const { writeFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const container = 'rezona-phase4-qa-postgres';
function run(command, args, options = {}) {
  const r = spawnSync(command, args, { maxBuffer: 256 * 1024 * 1024, ...options });
  if (r.error || r.status !== 0)
    throw Error(
      `${command} ${args.slice(0, 3).join(' ')} failed: ${r.error || r.stderr?.toString() || r.stdout?.toString()}`,
    );
  return r.stdout;
}
const url = (name) => `postgresql://phase4_qa:phase4-local-only@127.0.0.1:55444/${name}`;
const connect = (name) => new PrismaClient({ datasources: { db: { url: url(name) } } });
const sql = (name, text) =>
  run(
    'docker',
    [
      'exec',
      container,
      'psql',
      '-U',
      'phase4_qa',
      '-d',
      name,
      '-v',
      'ON_ERROR_STOP=1',
      '-Atc',
      text,
    ],
    { encoding: 'utf8' },
  ).trim();
function create(name) {
  assert.match(name, /^phase4_(fresh|snapshot)_[0-9]+$/);
  sql('postgres', `CREATE DATABASE ${name}`);
}
function migrate(name) {
  return run(
    process.execPath,
    [path.resolve(__dirname, '../node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: url(name) },
    },
  );
}
const tables = ['ProductListing', 'Order', 'OrderItem', 'Auction', 'CustomerWallet', 'WalletEntry'];
function fingerprint(name) {
  return Object.fromEntries(
    tables.map((table) => [
      table,
      sql(
        name,
        `SELECT count(*)||':'||COALESCE(md5(string_agg((to_jsonb(t)-'inventoryMappedAt'${table==='ProductListing'?"-'updatedAt'":''})::text,'' ORDER BY (to_jsonb(t)-'inventoryMappedAt'${table==='ProductListing'?"-'updatedAt'":''})::text)),'empty') FROM "${table}" t`,
      ),
    ]),
  );
}
async function main() {
  const suffix = Date.now(),
    fresh = `phase4_fresh_${suffix}`,
    snapshot = `phase4_snapshot_${suffix}`;
  create(fresh);
  const freshLog = migrate(fresh);
  assert.match(freshLog, /successfully applied/);
  create(snapshot);
  const dump = run('docker', [
    'exec',
    'rezona-phase2-qa-postgres',
    'pg_dump',
    '-U',
    'phase2_qa',
    '-d',
    'rezona_phase2_qa',
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
      'phase4_qa',
      '-d',
      snapshot,
    ],
    { input: dump },
  );
  const before = fingerprint(snapshot),
    priorMigrations = Number(
      sql(snapshot, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),
    );
  const upgradeLog = migrate(snapshot);
  const afterMigration = fingerprint(snapshot);
  assert.deepEqual(afterMigration, before);
  const db = connect(snapshot);
  let backfill;
  try {
    const { InventoryService } = require('../dist/src/inventory/inventory.service');
    const inventory = new InventoryService(
      db,
      { get: () => true },
      { emitToAdmins() {}, emitToCustomers() {} },
    );
    const pending = await inventory.backfill({ dryRun: true, limit: 50 }, 'PHASE4_QA');
    let afterId,
      visited = 0,
      reviewRequired = [];
    do {
      const batch = await inventory.backfill({ dryRun: false, afterId, limit: 50 }, 'PHASE4_QA');
      visited += batch.items.length;
      console.log(`Backfill QA clone: ${visited} products inspected`);
      reviewRequired.push(...batch.items.filter((i) => i.reviewRequired));
      afterId = batch.hasMore ? batch.nextAfterId : undefined;
      assert.ok(visited < 20000, 'Bounded QA clone only');
    } while (afterId);
    const counts = await Promise.all([
      db.inventoryBalance.count(),
      db.inventoryMovement.count(),
      db.inventoryAllocation.count(),
    ]);
    // Simulated restart: rerun already committed first batch and ensure no duplicates.
    await inventory.backfill({ dryRun: false, limit: 50 }, 'PHASE4_QA');
    assert.deepEqual(
      await Promise.all([
        db.inventoryBalance.count(),
        db.inventoryMovement.count(),
        db.inventoryAllocation.count(),
      ]),
      counts,
    );
    assert.deepEqual(fingerprint(snapshot), before);
    const states = {},
      mismatches = [];
    let cursor;
    do {
      const rows = await db.productListing.findMany({
        where: cursor ? { id: { gt: cursor } } : {},
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 50,
      });
      for (const row of rows) {
        const view = await inventory.productInventory(row.id);
        const state = view.reconciliation.state;
        states[state] = (states[state] || 0) + 1;
        if (['MISMATCH', 'INVALID_QUANTITY'].includes(state)) mismatches.push(row.id);
      }
      cursor = rows.length === 50 ? rows.at(-1).id : undefined;
    } while (cursor);
    assert.equal(mismatches.length, 0, JSON.stringify(mismatches));
    backfill = {
      previewCount: pending.items.length,
      visited,
      reviewRequired,
      states,
      counts: { balances: counts[0], movements: counts[1], allocations: counts[2] },
      restartNoDuplicates: true,
      commerceFingerprintsUnchanged: true,
    };
  } finally {
    await db.$disconnect();
  }
  const result = {
    time: new Date().toISOString(),
    scope: 'local isolated clone; source read-only pg_dump',
    fresh: {
      database: fresh,
      migrations: Number(
        sql(fresh, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),
      ),
    },
    upgrade: {
      database: snapshot,
      priorMigrations,
      migrations: Number(
        sql(snapshot, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),
      ),
      fingerprints: before,
      upgradeLog,
    },
    backfill,
    passed: true,
  };
  await mkdir(path.resolve(__dirname, '../docs/benchmarks/phase4'), { recursive: true });
  await writeFile(
    path.resolve(__dirname, '../docs/benchmarks/phase4/migrations.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
