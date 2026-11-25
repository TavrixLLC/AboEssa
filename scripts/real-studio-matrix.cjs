const fs = require('node:fs'),
  path = require('node:path'),
  { spawnSync } = require('node:child_process'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  m = JSON.parse(fs.readFileSync('D:/rezona-real-studio-qa/manifest.json', 'utf8')),
  secrets = JSON.parse(fs.readFileSync(path.join(m.dir, 'runtime-secrets.json'), 'utf8')),
  mode = process.argv[2],
  stamp = Date.now();
assert.match(m.regressionDb, /^rezona_real_studio_reg_[a-f0-9]{8}$/);
const env = {
  ...process.env,
  REZONA_REAL_STUDIO_QA: '1',
  PRODUCT_STUDIO_ENABLED: 'false',
  PRODUCT_STUDIO_LIVE_APPROVED: 'false',
  REAL_PRODUCT_STUDIO_REVIEW_ENABLED: 'false',
  GEMINI_BRAND_STUDIO_ENABLED: 'false',
  AI_LIVE_CALLS_APPROVED: 'false',
  IMAGE_AI_LIVE_APPROVED: 'false',
  PUSH_PROVIDER: 'disabled',
};
for (const key of [
  'FAL_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'REAL_STUDIO_SCREENSHOTS',
  'REAL_STUDIO_RENDER_RUNTIME',
  'REAL_STUDIO_ADMIN_EVIDENCE',
])
  delete env[key];
const redact = (s) =>
  s
    .replaceAll(secrets.postgresPassword, '[REDACTED]')
    .replaceAll(secrets.minioPassword, '[REDACTED]')
    .replaceAll(secrets.password, '[REDACTED]');
function run(name, exe, args, cwd = root, extra = {}) {
  const began = Date.now(),
    r = spawnSync(exe, args, {
      cwd,
      env: { ...env, ...extra },
      windowsHide: true,
      encoding: 'utf8',
      timeout: 600000,
      maxBuffer: 48 * 1024 * 1024,
    }),
    log = redact((r.stdout ?? '') + '\n' + (r.stderr ?? ''));
  fs.writeFileSync(path.join(m.out, name + '-' + stamp + '.log'), log, { flag: 'wx' });
  const result = {
    name,
    passed: r.status === 0,
    exitCode: r.status,
    durationMs: Date.now() - began,
    summary: log.trim().split(/\r?\n/).slice(-10),
  };
  fs.writeFileSync(
    path.join(m.out, name + '-' + stamp + '.json'),
    JSON.stringify(result, null, 2),
    { flag: 'wx' },
  );
  console.log(JSON.stringify(result));
  return result.passed;
}
let passed = true;
if (mode === 'backend') {
  passed =
    run(
      'backend-unit',
      process.execPath,
      ['node_modules/jest/bin/jest.js', 'tests/unit', '--runInBand'],
      root,
      { NODE_OPTIONS: '--require ' + path.join(root, 'scripts/studio20-network-fence.cjs') },
    ) && passed;
  passed =
    run('backend-typecheck', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']) &&
    passed;
  passed =
    run('backend-lint', process.execPath, [
      'node_modules/eslint/bin/eslint.js',
      'src/image-enhancement/*.ts',
      'src/product-intake/intake-enhancement.controller.ts',
      'src/product-intake/product-intake.module.ts',
      'tests/unit/real-studio-review.spec.ts',
    ]) && passed;
} else if (mode === 'e2e') {
  const db = `postgresql://real_studio_qa:${encodeURIComponent(secrets.postgresPassword)}@127.0.0.1:55456/${m.regressionDb}`;
  passed = run(
    'backend-e2e',
    process.execPath,
    ['node_modules/jest/bin/jest.js', '--config', 'tests/jest-e2e.json', '--runInBand'],
    root,
    {
      RUN_DB_E2E: 'true',
      DATABASE_URL_TEST: db,
      ADMIN_QA_DATABASE_URL: db,
      ACCOUNT_QA_DATABASE_URL: db,
      NODE_OPTIONS: '--require ' + path.join(root, 'scripts/studio20-network-fence.cjs'),
    },
  );
} else if (mode === 'mobile') {
  const mobile = path.resolve(root, '../AboEssaMobile');
  for (const [name, dir, args] of [
    ['admin-analysis', 'apps/admin_app', ['analyze', '--no-pub']],
    ['admin-tests', 'apps/admin_app', ['test', '--no-pub', '--reporter', 'expanded']],
    ['customer-tests', 'apps/customer_app', ['test', '--no-pub', '--reporter', 'expanded']],
    ['shared-ui-tests', 'packages/shared_ui', ['test', '--no-pub', '--reporter', 'expanded']],
    ['api-client-tests', 'packages/api_client', ['test', '--no-pub', '--reporter', 'expanded']],
  ])
    passed =
      run(
        name,
        'cmd.exe',
        ['/d', '/c', 'C:/Users/3ma/develop/flutter/bin/flutter.bat', ...args],
        path.join(mobile, dir),
      ) && passed;
} else throw Error('UNKNOWN_MATRIX');
process.exit(passed ? 0 : 1);
