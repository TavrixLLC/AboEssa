// Reproducible local-only test evidence, no deployment or remote writes.
if (process.env.REZONA_PHASE4_QA !== '1') throw Error('Explicit Phase 4 QA flag required');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..'),
  mobile = path.resolve(root, '../AboEssaMobile');
const out = path.join(root, 'docs/benchmarks/phase4/tests');
fs.mkdirSync(out, { recursive: true });
const env = {
  ...process.env,
  RUN_DB_E2E: 'true',
  DATABASE_URL_TEST: 'postgresql://phase4_qa:phase4-local-only@127.0.0.1:55444/rezona_phase4_qa',
};
env.ADMIN_QA_DATABASE_URL = env.DATABASE_URL_TEST;
env.ACCOUNT_QA_DATABASE_URL = env.DATABASE_URL_TEST;
const flutter = 'C:/Users/3ma/develop/flutter/bin/flutter.bat';
const jobs = [
  [
    'backend-build',
    process.execPath,
    [path.join(root, 'node_modules/@nestjs/cli/bin/nest.js'), 'build'],
    root,
  ],
  [
    'inventory-lint',
    process.execPath,
    [
      path.join(root, 'node_modules/eslint/bin/eslint.js'),
      'src/inventory/*.ts',
      'src/catalog/catalog-media.interceptor.ts',
    ],
    root,
  ],
  [
    'backend-unit',
    process.execPath,
    [path.join(root, 'node_modules/jest/bin/jest.js'), 'tests/unit', '--runInBand'],
    root,
  ],
  [
    'backend-e2e',
    process.execPath,
    [
      path.join(root, 'node_modules/jest/bin/jest.js'),
      '--config',
      'tests/jest-e2e.json',
      '--runInBand',
    ],
    root,
  ],
  [
    'admin-analyze',
    'cmd.exe',
    ['/d', '/c', flutter, 'analyze', '--no-pub'],
    path.join(mobile, 'apps/admin_app'),
  ],
  [
    'admin-tests',
    'cmd.exe',
    ['/d', '/c', flutter, 'test', '--no-pub', '--reporter', 'expanded'],
    path.join(mobile, 'apps/admin_app'),
  ],
  [
    'inventory-flag-tests',
    'cmd.exe',
    [
      '/d',
      '/c',
      flutter,
      'test',
      '--no-pub',
      '--dart-define=INVENTORY_MANAGEMENT_ENABLED=true',
      'test/inventory_test.dart',
      '--reporter',
      'expanded',
    ],
    path.join(mobile, 'apps/admin_app'),
  ],
  [
    'customer-tests',
    'cmd.exe',
    ['/d', '/c', flutter, 'test', '--no-pub', '--reporter', 'expanded'],
    path.join(mobile, 'apps/customer_app'),
  ],
  [
    'shared-ui-tests',
    'cmd.exe',
    ['/d', '/c', flutter, 'test', '--no-pub', '--reporter', 'expanded'],
    path.join(mobile, 'packages/shared_ui'),
  ],
  [
    'api-client-tests',
    'cmd.exe',
    ['/d', '/c', flutter, 'test', '--no-pub', '--reporter', 'expanded'],
    path.join(mobile, 'packages/api_client'),
  ],
];
const results = [];
for (const [name, cmd, args, cwd] of jobs) {
  const start = Date.now();
  console.log(`Running ${name}`);
  const r = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 240000,
  });
  const log = (r.stdout || '') + '\n' + (r.stderr || '');
  fs.writeFileSync(path.join(out, name + '.log'), log);
  const result = {
    name,
    exitCode: r.status,
    durationMs: Date.now() - start,
    error: r.error?.message,
    summary: log.trim().split(/\r?\n/).slice(-6),
  };
  results.push(result);
  console.log(JSON.stringify(result));
  fs.writeFileSync(
    path.join(out, 'matrix.json'),
    JSON.stringify(
      {
        time: new Date().toISOString(),
        results,
        complete: results.length === jobs.length,
        passed: results.length === jobs.length && results.every((v) => v.exitCode === 0),
      },
      null,
      2,
    ),
  );
}
if (results.some((v) => v.exitCode !== 0)) process.exitCode = 1;
