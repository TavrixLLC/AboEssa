if(process.env.REZONA_PHASE6_QA!=='1')throw Error('Explicit Phase 6 evidence scope required');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),workspace=path.resolve(root,'..'),mobile=path.join(workspace,'AboEssaMobile/apps/admin_app');
const out=path.join(root,'docs/benchmarks/phase6');
const read=file=>JSON.parse(fs.readFileSync(path.join(out,file),'utf8'));
const backend=read('tests/matrix-backend.json'),flutter=read('tests/matrix-mobile.json'),checks=read('checks.json'),build=read('device/build.json');
assert.equal(backend.passed,true);assert.equal(flutter.passed,true);assert.equal(checks.passed,true);assert.equal(checks.checks.length,19);
for(const file of ['migrations.json','budget.json','intake-regressions.json','commerce-regressions.json'])assert.equal(read(file).passed,true);
assert.equal(build.package,'com.singlestore.admin_app.phase6qa');
const hash=file=>({file:path.relative(workspace,file).replaceAll('\\','/'),sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
const directories=[path.join(root,'src/ai'),path.join(root,'src/product-intake'),path.join(mobile,'lib/features/product_intake')];
const sourceFiles=directories.flatMap(dir=>fs.readdirSync(dir).filter(f=>/\.(ts|dart)$/.test(f)).map(f=>path.join(dir,f)));
sourceFiles.push(...[
  'prisma/schema.prisma','src/common/filters/http-exception.filter.ts','tests/unit/recognition.spec.ts','tests/unit/recognition-runtime.spec.ts',
  'tests/unit/product-intake.spec.ts','tests/admin-console-flow.e2e-spec.ts','tests/customer-account-deletion.e2e-spec.ts',
  'prisma/migrations/202611200001_product_recognition/migration.sql',
  'prisma/migrations/202611200002_recognition_request_sequence/migration.sql',
  'prisma/migrations/202611200003_recognition_model_revision/migration.sql',
  'docs/phase6-local.env.example','docs/rezona-phase-6-ai-recognition-duplicate-detection.md',
].map(f=>path.join(root,f)));
sourceFiles.push(...fs.readdirSync(path.join(root,'scripts')).filter(f=>f.startsWith('phase6-')).map(f=>path.join(root,'scripts',f)));
sourceFiles.push(...['android/app/build.gradle.kts','integration_test/phase6_recognition_device_test.dart','test_driver/phase6_driver.dart',
  'test/intake_recognition_test.dart','test/intake_recognition_card_test.dart'].map(f=>path.join(mobile,f)));
const apk=path.join(mobile,'build/app/outputs/flutter-apk/app-debug.apk');assert.equal(hash(apk).sha256,build.sha256);
for(const [file,expected] of Object.entries(build.sourceHashes))assert.equal(hash(path.join(mobile,'lib/features/product_intake',file)).sha256,expected);
const evidence=['tests/matrix-backend.json','tests/matrix-mobile.json','checks.json','intake-regressions.json',
  'commerce-regressions.json','budget.json','migrations.json','matching-text-evaluation.json','device/build.json'];
const result={time:new Date().toISOString(),status:'LOCAL_MOCK_VERIFIED_NOT_PRODUCTION_READY',
  productionDeployed:false,gitPushed:false,phase7Started:false,externalInferenceRequests:0,
  physical:{state:'USER_DEFERRED_AFTER_XIAOMI_INSTALL_REJECTION',nativeWorkflowPassed:false,releaseOrWanVerified:false},
  live:{state:'USER_DECLINED_PAID_CALLS',qualityOrCostVerified:false},
  tests:{backendUnit:266,backendE2e:27,admin:166,customer:166,sharedUi:18,apiClient:20,totalUniquePassed:663,inheritedOptionalSkip:1,
    phase6IntegrationGroups:19,intakeRegressionGroups:11,inventoryCommerceRegressionGroups:16},
  testApk:{...hash(apk),bytes:fs.statSync(apk).size,package:build.package,distribution:'DEBUG AUTOMATED TEST ONLY; not a customer/release artifact'},
  evidence:evidence.map(f=>hash(path.join(out,f))),sources:[...new Set(sourceFiles)].map(hash)};
fs.writeFileSync(path.join(out,'evidence-manifest.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,tests:result.tests,physical:result.physical,testApk:result.testApk},null,2));
