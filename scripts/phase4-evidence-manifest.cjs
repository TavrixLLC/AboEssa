// Local hashes only: no upload or credentials copied.
if (process.env.REZONA_PHASE4_QA !== '1') throw Error('Explicit Phase 4 QA flag required');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  mobile = path.resolve(root, '../AboEssaMobile');
const evidence = path.join(root, 'docs/benchmarks/phase4');
const json = (file) => JSON.parse(fs.readFileSync(path.join(evidence, file), 'utf8'));
const matrix = json('tests/matrix.json');
if (
  matrix.results.length !== 10 ||
  !matrix.passed ||
  !json('integration.json').passed ||
  !json('migrations.json').passed
)
  throw Error('Incomplete or failed evidence');
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((v) => (v.isDirectory() ? walk(path.join(dir, v.name)) : [path.join(dir, v.name)]));
const files = [
  ...walk(path.join(root, 'src/inventory')),
  ...walk(path.join(mobile, 'apps/admin_app/lib/features/inventory')),
  ...walk(path.join(root, 'prisma/migrations/202611190001_warehouse_inventory')),
  ...walk(path.join(root, 'prisma/migrations/202611190002_inventory_zero_and_allocation_checks')),
  ...[
    'prisma/schema.prisma',
    'src/products/products.service.ts',
    'src/products/products.controller.ts',
    'src/admin-console/admin-console.service.ts',
    'src/shipping/shipping.service.ts',
    'src/catalog/catalog-media.interceptor.ts',
    'src/common/constants/permissions.constants.ts',
    'src/permissions/permissions.catalog.ts',
    'src/config/configuration.ts',
    'src/config/env.validation.ts',
    'src/app.module.ts',
    'docs/rezona-phase-4-warehouse-inventory.md',
    'tests/unit/inventory-ledger.spec.ts',
  ].map((f) => path.join(root, f)),
  ...[
    'apps/admin_app/lib/app/admin_di.dart',
    'apps/admin_app/lib/app/admin_router.dart',
    'apps/admin_app/lib/app/admin_routes.dart',
    'apps/admin_app/lib/app/admin_destination_registry.dart',
    'apps/admin_app/lib/app/admin_navigation_scaffold.dart',
    'apps/admin_app/lib/features/admin_console/presentation/console_pages.dart',
    'apps/admin_app/test/inventory_test.dart',
  ].map((f) => path.join(mobile, f)),
  ...fs
    .readdirSync(__dirname)
    .filter((f) => /^phase4-.*\.cjs$/.test(f))
    .map((f) => path.join(__dirname, f)),
  ...walk(evidence).filter((f) => !f.endsWith('evidence-manifest.json')),
];
const hash = (file) => ({
  path: path.relative(path.resolve(root, '..'), file).replaceAll('\\', '/'),
  bytes: fs.statSync(file).size,
  sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
});
const apk = path.join(mobile, 'apps/admin_app/build/app/outputs/flutter-apk/app-debug.apk');
const result = {
  time: new Date().toISOString(),
  scope: 'local validation only; no production deployment/push/Phase 5',
  node: process.version,
  prisma: require('@prisma/client/package.json').version,
  files: [...new Set(files)].sort().map(hash),
  androidDebugArtifact: fs.existsSync(apk) ? hash(apk) : null,
  passed: true,
};
fs.writeFileSync(path.join(evidence, 'evidence-manifest.json'), JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      time: result.time,
      files: result.files.length,
      androidDebugArtifact: result.androidDebugArtifact,
      passed: true,
    },
    null,
    2,
  ),
);
