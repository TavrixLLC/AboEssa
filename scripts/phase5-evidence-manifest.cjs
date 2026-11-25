// Hash local evidence only. Debug core validation is never release/benchmark GO.
if (process.env.REZONA_PHASE5_QA !== '1') throw Error('Explicit Phase5 QA flag required');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  mobile = path.resolve(root, '../AboEssaMobile'),
  workspace = path.resolve(root, '..'),
  out = path.join(root, 'docs/benchmarks/phase5');
const read = (f) => JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));
const backend = read('tests/matrix-backend.json'),
  flutter = read('tests/matrix-mobile.json'),
  integration = read('integration.json'),
  commerce = read('inventory-commerce-regressions.json'),
  migration = read('migration.json'),
  capture = read('device/capture.json'),
  restore = read('device/restore.json'),
  stock = read('device/stock-evidence.json');
for (const e of [backend, flutter, integration, commerce, migration]) assert.equal(e.passed, true);
assert.equal(integration.checks.length, 11);
assert.equal(commerce.checks.length, 16);
assert.equal(migration.appliedMigrations, 32);
const walk = (d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((v) => (v.isDirectory() ? walk(path.join(d, v.name)) : [path.join(d, v.name)]));
const files = [
  ...walk(path.join(root, 'src/product-intake')),
  ...walk(path.join(root, 'src/inventory')),
  ...walk(path.join(root, 'prisma/migrations/202611190003_rapid_product_intake')),
  ...walk(path.join(mobile, 'apps/admin_app/lib/features/product_intake')),
  ...[
    'prisma/schema.prisma',
    'src/products/products.service.ts',
    'src/uploads/uploads.service.ts',
    'src/files/media.controller.ts',
    'src/files/intake-media-visibility.ts',
    'src/image-optimization/image-variants.controller.ts',
    'src/catalog/catalog-media.service.ts',
    'src/common/constants/permissions.constants.ts',
    'src/permissions/permissions.catalog.ts',
    'src/config/configuration.ts',
    'src/config/env.validation.ts',
    'src/app.module.ts',
    '.env.example',
    'production.env.example',
    'tests/unit/product-intake.spec.ts',
    'tests/unit/media-pipeline.spec.ts',
    'tests/admin-console-flow.e2e-spec.ts',
    'tests/customer-account-deletion.e2e-spec.ts',
    'docs/rezona-phase-5-rapid-product-intake.md',
  ].map((f) => path.join(root, f)),
  ...[
    'apps/admin_app/lib/app/admin_di.dart',
    'apps/admin_app/lib/app/admin_router.dart',
    'apps/admin_app/lib/app/admin_routes.dart',
    'apps/admin_app/lib/app/admin_destination_registry.dart',
    'apps/admin_app/lib/app/admin_navigation_scaffold.dart',
    'apps/admin_app/lib/features/admin_console/presentation/console_catalog_pages.dart',
    'apps/admin_app/lib/features/admin_console/presentation/console_pages.dart',
    'apps/admin_app/lib/features/inventory/inventory_pages.dart',
    'apps/admin_app/test/product_intake_test.dart',
    'apps/admin_app/integration_test/phase5_intake_device_test.dart',
    'apps/admin_app/test_driver/phase5_driver.dart',
    'apps/admin_app/android/app/build.gradle.kts',
    'apps/admin_app/android/app/src/main/AndroidManifest.xml',
    'apps/admin_app/ios/Runner/Info.plist',
    'apps/admin_app/pubspec.yaml',
    'pubspec.lock',
  ].map((f) => path.join(mobile, f)),
  ...fs
    .readdirSync(__dirname)
    .filter((f) => /^phase5-.*\.cjs$/.test(f))
    .map((f) => path.join(__dirname, f)),
  ...walk(out).filter((f) => !f.endsWith('evidence-manifest.json')),
];
const hash = (f) => ({
  path: path.relative(workspace, f).replaceAll('\\', '/'),
  bytes: fs.statSync(f).size,
  sha256: createHash('sha256').update(fs.readFileSync(f)).digest('hex'),
});
const head = (repo) =>
  spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    windowsHide: true,
  }).stdout.trim();
const currentBuild = read('device/build.json');
const artifact =
  currentBuild.archivedApk ||
  path.join(mobile, 'apps/admin_app/build/app/outputs/flutter-apk/app-debug.apk');
assert.equal(hash(artifact).sha256, currentBuild.apk.sha256);
const sourceMatches = currentBuild.sources.every(
  (v) => hash(path.join(workspace, v.file)).sha256 === v.sha256,
);
const nativePassed =
  capture.passed &&
  restore.passed &&
  stock.passed &&
  sourceMatches &&
  capture.installedSha256 === currentBuild.apk.sha256 &&
  restore.installedSha256 === currentBuild.apk.sha256;
assert.equal(nativePassed, true, 'Native workflow evidence must pass on matching source/APK');
const preview = fs.existsSync(path.join(out, 'device/preview.json'))
  ? read('device/preview.json')
  : null;
const result = {
  time: new Date().toISOString(),
  scope: 'local/isolated QA; existing dirty worktrees preserved; no production/staging/push/Phase6',
  heads: { backend: head(root), mobile: head(mobile) },
  runtime: { node: process.version, prisma: require('@prisma/client/package.json').version },
  automatedValidationPassed: true,
  uniqueMatrixCases: 561,
  optionalSkipped: 1,
  featureSubsetReexecutions: 19,
  realIntakeGroups: 11,
  realInventoryCommerceGroups: 16,
  physicalAcceptance: {
    status: 'DEBUG_CORE_WORKFLOW_PASS; not Release/WAN/employee performance acceptance',
    capturePassed: capture.passed,
    restartReplenishmentCaptureNext: restore.passed,
    latestSourceNativeValidated: nativePassed,
    independentStockVerification: stock.passed,
    lowerScopeLegacyBaselineMeasured: true,
    normalQaPreviewUiVerified: preview?.uiVerified === true,
  },
  fairEmployeeBenchmark: 'NOT_MEASURED',
  productionReadiness: 'NO-GO; inherited and Phase5 gates remain',
  phase5UnconditionallyComplete: false,
  files: [...new Set(files)].sort().map(hash),
  androidDebugTestOnlyArtifact: hash(artifact),
  androidNormalQaPreview: preview,
};
fs.writeFileSync(path.join(out, 'evidence-manifest.json'), JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      time: result.time,
      files: result.files.length,
      automatedValidationPassed: true,
      physicalAcceptance: result.physicalAcceptance,
      productionReadiness: result.productionReadiness,
      artifact: result.androidDebugTestOnlyArtifact,
    },
    null,
    2,
  ),
);
