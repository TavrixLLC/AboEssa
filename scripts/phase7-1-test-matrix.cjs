if (process.env.REZONA_PHASE71_QA !== '1') throw Error('Explicit Phase 7 isolated tests only');
const { spawnSync } = require('node:child_process'),
  fs = require('node:fs'),
  path = require('node:path');
const root = path.resolve(__dirname, '..'),
  mobile = path.resolve(root, '../AboEssaMobile');
const out = path.join(root, 'docs/benchmarks/phase7-1/tests');
fs.mkdirSync(out, { recursive: true });
const database = 'postgresql://phase71_qa:phase71-local-only@127.0.0.1:55452/rezona_phase71_qa';
const env = {
  ...process.env,
  REZONA_PHASE71_QA: '1',
  RUN_DB_E2E: 'true',
  DATABASE_URL_TEST: database,
  ADMIN_QA_DATABASE_URL: database,
  ACCOUNT_QA_DATABASE_URL: database,
  AI_LIVE_CALLS_APPROVED: 'false',
};
const node = (file, ...args) => [
  process.execPath,
  [path.join(root, 'node_modules', file), ...args],
  root,
];
const dart = (dir, ...args) => [
  'cmd.exe',
  ['/d', '/c', 'C:/Users/3ma/develop/flutter/bin/flutter.bat', ...args],
  path.join(mobile, dir),
];
const jobs = [
  ['backend-build', ...node('@nestjs/cli/bin/nest.js', 'build')],
  ['backend-lint', ...node('eslint/bin/eslint.js', 'src/ai/*.ts', 'src/product-intake/*.ts', 'src/image-enhancement/*.ts')],
  ['backend-unit', ...node('jest/bin/jest.js', 'tests/unit', '--runInBand')],
  ['backend-e2e', ...node('jest/bin/jest.js', '--config', 'tests/jest-e2e.json', '--runInBand')],
  ['admin-analyze', ...dart('apps/admin_app', 'analyze', '--no-pub')],
  ['admin-tests', ...dart('apps/admin_app', 'test', '--no-pub', '--reporter', 'expanded')],
  ['customer-tests', ...dart('apps/customer_app', 'test', '--no-pub', '--reporter', 'expanded')],
  ['shared-ui-tests', ...dart('packages/shared_ui', 'test', '--no-pub', '--reporter', 'expanded')],
  [
    'api-client-tests',
    ...dart('packages/api_client', 'test', '--no-pub', '--reporter', 'expanded'),
  ],
];
const group = process.argv[2] ?? 'all',
  selected = jobs.filter(
    ([name]) =>
      group === 'all' ||
      (group === 'backend' ? name.startsWith('backend') : !name.startsWith('backend')),
  );
const results = [];
// This DB now contains user-authorized real intake records, not disposable fixtures.
// Destructive DB e2e must use a newly approved disposable database instead.
if (selected.some(([name]) => name === 'backend-e2e') && fs.existsSync('D:/rezona-phase7-1-qa/real-products-20261121/intake-journal.json')) {
  throw Error('Protected real product intake data: refusing destructive e2e against Phase71 QA');
}
for (const [name, exe, args, cwd] of selected) {
  console.log('Running ' + name);
  const started = Date.now();
  const r = spawnSync(exe, args, {
    cwd,
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 300000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const log = (r.stdout ?? '') + '\n' + (r.stderr ?? '');
  fs.writeFileSync(path.join(out, name + '.log'), log);
  const result = {
    name,
    exitCode: r.status,
    durationMs: Date.now() - started,
    error: r.error?.message,
    summary: log.trim().split(/\r?\n/).slice(-8),
  };
  results.push(result);
  console.log(JSON.stringify(result));
  fs.writeFileSync(
    path.join(out, 'matrix-' + group + '.json'),
    JSON.stringify(
      {
        time: new Date().toISOString(),
        scope: 'Isolated Phase7.1 DB only; no production writes or paid AI',
        results,
        complete: results.length === selected.length,
        passed: results.length === selected.length && results.every((r) => r.exitCode === 0),
      },
      null,
      2,
    ),
  );
}
if (results.some((r) => r.exitCode !== 0)) process.exitCode = 1;
