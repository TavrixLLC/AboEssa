// Local isolated QA only; never point these tests at a shared/customer database.
if (process.env.REZONA_PHASE5_QA !== '1') throw Error('Explicit Phase 5 QA flag required');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path');
const root = path.resolve(__dirname, '..'),
  mobile = path.resolve(root, '../AboEssaMobile');
const out = path.join(root, 'docs/benchmarks/phase5/tests');
fs.mkdirSync(out, { recursive: true });
const env = {
  ...process.env,
  RUN_DB_E2E: 'true',
  DATABASE_URL_TEST: 'postgresql://phase5_qa:phase5-local-only@127.0.0.1:55446/rezona_phase5_qa',
};
env.ADMIN_QA_DATABASE_URL = env.DATABASE_URL_TEST;
env.ACCOUNT_QA_DATABASE_URL = env.DATABASE_URL_TEST;
const flutter = 'C:/Users/3ma/develop/flutter/bin/flutter.bat';
const node = (file, ...args) => [
  process.execPath,
  [path.join(root, 'node_modules', file), ...args],
  root,
];
const dart = (dir, ...args) => ['cmd.exe', ['/d', '/c', flutter, ...args], path.join(mobile, dir)];
const jobs = [
  ['backend-build', ...node('@nestjs/cli/bin/nest.js', 'build')],
  [
    'intake-inventory-lint',
    ...node(
      'eslint/bin/eslint.js',
      'src/product-intake/*.ts',
      'src/inventory/*.ts',
      'src/files/intake-media-visibility.ts',
      'src/files/media.controller.ts',
    ),
  ],
  ['backend-unit', ...node('jest/bin/jest.js', 'tests/unit', '--runInBand')],
  ['backend-e2e', ...node('jest/bin/jest.js', '--config', 'tests/jest-e2e.json', '--runInBand')],
  ['admin-analyze', ...dart('apps/admin_app', 'analyze', '--no-pub')],
  ['admin-tests', ...dart('apps/admin_app', 'test', '--no-pub', '--reporter', 'expanded')],
  [
    'intake-inventory-flag-tests',
    ...dart(
      'apps/admin_app',
      'test',
      '--no-pub',
      '--dart-define=INVENTORY_MANAGEMENT_ENABLED=true',
      '--dart-define=RAPID_PRODUCT_INTAKE_ENABLED=true',
      'test/inventory_test.dart',
      'test/product_intake_test.dart',
      '--reporter',
      'expanded',
    ),
  ],
  ['customer-tests', ...dart('apps/customer_app', 'test', '--no-pub', '--reporter', 'expanded')],
  ['shared-ui-tests', ...dart('packages/shared_ui', 'test', '--no-pub', '--reporter', 'expanded')],
  [
    'api-client-tests',
    ...dart('packages/api_client', 'test', '--no-pub', '--reporter', 'expanded'),
  ],
];
const group = process.argv[2] || 'all';
const selected = jobs.filter(
  ([n]) =>
    group === 'all' ||
    (group === 'backend'
      ? n.startsWith('backend') || n.endsWith('lint')
      : !n.startsWith('backend') && !n.endsWith('lint')),
);
const results = [];
for (const [name, cmd, args, cwd] of selected) {
  console.log(`Running ${name}`);
  const start = Date.now();
  const r = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 300000,
    windowsHide: true,
  });
  const log = (r.stdout || '') + '\n' + (r.stderr || '');
  fs.writeFileSync(path.join(out, name + '.log'), log);
  const result = {
    name,
    exitCode: r.status,
    durationMs: Date.now() - start,
    error: r.error?.message,
    summary: log.trim().split(/\r?\n/).slice(-7),
  };
  results.push(result);
  console.log(JSON.stringify(result));
  fs.writeFileSync(
    path.join(out, `matrix-${group}.json`),
    JSON.stringify(
      {
        time: new Date().toISOString(),
        environment: 'isolated Phase5 localhost PostgreSQL; no production writes',
        results,
        complete: results.length === selected.length,
        passed: results.length === selected.length && results.every((v) => v.exitCode === 0),
      },
      null,
      2,
    ),
  );
}
if (results.some((v) => v.exitCode !== 0)) process.exitCode = 1;
