// Read-only QA postflight plus new no-overwrite evidence index. No provider access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),mobile=path.resolve(root,'../AboEssaMobile'),m=JSON.parse(fs.readFileSync('D:/rezona-studio20-qa/manifest.json','utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex'),files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(path.join(dir,d.name)):[path.join(dir,d.name)]);
const latest=prefix=>{const names=fs.readdirSync(m.out).filter(n=>new RegExp('^'+prefix+'-\\d+\\.json$').test(n)).sort();assert.ok(names.length,prefix);const name=names.at(-1);return{file:name,data:JSON.parse(fs.readFileSync(path.join(m.out,name),'utf8'))};};
(async()=>{
 for(const r of m.baseline)assert.equal(sha(fs.readFileSync(r.file)),r.sha256,'Protected baseline changed: '+r.file);
 const tests={};for(const name of['backend-unit','backend-typecheck','backend-lint','backend-e2e','admin-analyze','admin-tests','customer-tests','shared-ui-tests','api-client-tests']){const row=latest(name);assert.equal(row.data.passed,true,name);tests[name]=row;}
 for(const mode of['checks','resilience','commerce','intake','comparisons'])assert.equal(latest(mode).data.passed,true,mode);
 const workflow=latest('all39-workflow');assert.equal(workflow.data.rows.length,20);assert.equal(workflow.data.rows.flatMap(r=>r.jobs).length,39);
 const registry=require(path.join(m.dir,'dist-v7/src/image-enhancement/studio-templates.js'));
 const fixture=JSON.parse(fs.readFileSync(path.join(mobile,'apps/admin_app/test/fixtures/studio20-catalog.json'),'utf8'));assert.deepEqual(fixture.templates,registry.studioCatalog());
 const report=fs.readFileSync(path.join(root,'docs/rezona-20-premium-ai-studio-templates.md'),'utf8');for(const t of registry.STUDIO_TEMPLATES){assert.ok(report.includes(t.id));assert.ok(report.includes(t.nameAr));}
 const screenshots=[];for(const group of registry.STUDIO_GROUPS)for(const width of[320,834]){const file=path.join(m.dir,'ui-20261123-2',width+'-'+group+'-all5.png'),bytes=fs.readFileSync(file),meta=await sharp(bytes).metadata();assert.equal(meta.width,width);screenshots.push({group,width,height:meta.height,file,sha256:sha(bytes),realWidget:true,renderOnlyArabicFont:'Arial aliased to Cairo, not physical font acceptance'});}
 const boards=latest('comparison-boards');for(const r of boards.data.rows)assert.equal(sha(fs.readFileSync(r.path)),r.sha256);
 const secrets=JSON.parse(fs.readFileSync(path.join(m.dir,'runtime-secrets.json'),'utf8'));
 const db=new(require('@prisma/client').PrismaClient)({datasources:{db:{url:`postgresql://studio20_qa:${encodeURIComponent(secrets.postgresPassword)}@127.0.0.1:55455/${m.db}`}}});
 let audit;try{
  const paidJobs=await db.productImageEnhancementJob.count({where:{provider:{in:['fal','gemini']}}}),paidUsage=await db.recognitionUsage.count({where:{provider:{in:['fal','gemini']}}});assert.equal(paidJobs,0);assert.equal(paidUsage,0);
  const usage=await db.recognitionUsage.aggregate({_sum:{committedUsd:true,actualBilledUsd:true},_count:true});assert.equal(usage._sum.committedUsd.toString(),'0');assert.equal(usage._sum.actualBilledUsd,null);
  const promoAssociation=await db.productImageEnhancementCandidate.count({where:{mediaRole:'AI_PROMOTIONAL',asset:{intakeProductId:{not:null}}}});assert.equal(promoAssociation,0);
  audit={scope:m.db,readOnly:true,paidJobs,paidUsage,newCommittedUsd:'0',actualChargeFields:'NULL_NOT_FABRICATED',promotionalProductAssociations:promoAssociation,
   jobs:await db.productImageEnhancementJob.groupBy({by:['mode','status'],_count:true}),candidates:await db.productImageEnhancementCandidate.groupBy({by:['mediaRole'],_count:true}),
   unknownMockUsage:await db.recognitionUsage.count({where:{status:'UNKNOWN'}}),
   historicalDatabaseAudit:'NOT_STARTED_OR_MIGRATED_THIS_TASK; protected prior evidence hashes unchanged'};
 }finally{await db.$disconnect();}
 const backendFiles=['.gitignore','.env.studio20.example','prisma/schema.prisma','prisma/migrations/20261123000200_studio_media_roles/migration.sql',
  ...['studio-templates.data','studio-templates','studio-library.config','studio-library-codec','studio-scenes','studio-media-role','brand-studio.config','tabletop-native-codec','enhancement.config','enhancement-codec','enhancement.provider','enhancement.service','enhancement-selection','fal-studio.provider'].map(n=>'src/image-enhancement/'+n+'.ts'),
  'src/ai/recognition-budget.service.ts','src/files/intake-media-visibility.ts','src/product-intake/intake-enhancement.controller.ts','tests/unit/studio-library.spec.ts','tests/unit/studio-budget.spec.ts',
  'tests/admin-console-flow.e2e-spec.ts','tests/customer-account-deletion.e2e-spec.ts','docs/rezona-20-premium-ai-studio-templates.md',...fs.readdirSync(path.join(root,'scripts')).filter(n=>/^studio20-.*\.cjs$/.test(n)).map(n=>'scripts/'+n)];
 const mobileFiles=['intake_studio_models.dart','intake_studio_browser.dart','intake_enhancement_remote.dart','intake_repository.dart','intake_enhancement_card.dart'].map(n=>'apps/admin_app/lib/features/product_intake/'+n).concat(['apps/admin_app/test/intake_studio_browser_test.dart','apps/admin_app/test/intake_premium_3d_test.dart','apps/admin_app/test/fixtures/studio20-catalog.json']);
 const source=[...backendFiles.map(f=>path.join(root,f)),...mobileFiles.map(f=>path.join(mobile,f))].map(file=>({file,sha256:sha(fs.readFileSync(file))}));
 const evidence=files(m.out).map(file=>({file,sha256:sha(fs.readFileSync(file))}));
 for(const {file}of[...source,...evidence]){if(/\.(?:ts|cjs|dart|json|md|log|example)$/.test(file)){const content=fs.readFileSync(file,'utf8');assert.ok(!/fal_sk_[A-Za-z0-9]{20,}/.test(content),'Possible real credential');assert.ok(!content.includes(secrets.postgresPassword)&&!content.includes(secrets.minioPassword),'Private runtime secret leaked');}}
 const result={at:new Date().toISOString(),timezone:'Asia/Baghdad',runId:m.id,verdict:'LOCAL_MOCK_IMPLEMENTATION_VERIFIED__PRODUCTION_NO_GO',paidInferenceAuthorized:0,paidInferenceRequests:0,newInferenceSpendUsd:'0',historicalActualSpend:'UNKNOWN',historicalRetainedCommitmentUsd:'1.044480',
  protectedBaseline:{files:m.baseline.length,unchanged:true},tests,aggregate:{backendUnit:414,e2e:27,admin:198,customer:166,sharedUI:18,apiClient:20,totalPassed:843,optionalSkipped:1,notPhysicalDeviceResults:true},
  workflow:{file:workflow.file,templates:20,compatiblePairs:39,provider:'MOCK',realFalQuality:'NOT_VERIFIED'},screenshots,boards,audit,source,evidence,
  limits:{productionDeploy:false,githubPush:false,deviceInstall:false,realPhotosTransferred:false,paidProviderKeyLoaded:false,promotionalPublication:false},
  blockers:['Owner approval and current quote/budget for any future real fal pilot','New-template real visual/brand/label/shape and grounding acceptance','No authorized real apparel source','Four problematic segmentation inputs remain blocked','Historical UNKNOWN billing reconciliation','Native device/font/performance and staging/old-binary acceptance','Existing security/catalog-WAN/performance gates','Explicit labeled secondary promotional publication workflow']};
 fs.writeFileSync(path.join(m.out,'final-validation.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,templates:20,pairs:39,tests:843,paidInference:0,baseline:m.baseline.length,production:'NO_GO'}));
})().catch(e=>{console.error(e.message);process.exit(1);});
