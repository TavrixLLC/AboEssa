// Integrity metadata only. Photographs, credentials and binary assets stay outside Git.
if(process.env.REZONA_PHASE72_QA!=='1')throw Error('Explicit isolated evidence only');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),runId=process.argv[2];
if(!/^20261122-[a-f0-9]{8}$/.test(runId??''))throw Error('Invalid run');
const out=path.join(root,'docs/benchmarks/phase7-2',runId),qa=path.join('D:/rezona-phase7-2-qa',runId);
if(!fs.existsSync(path.join(out,'run.json')))throw Error('Unknown run');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const names=[
 'src/image-enhancement/brand-studio.config.ts','src/image-enhancement/brand-studio-codec.ts','src/image-enhancement/gemini-studio.provider.ts',
 'src/image-enhancement/enhancement.config.ts','src/image-enhancement/enhancement-codec.ts','src/image-enhancement/enhancement-isolate.ts',
 'src/image-enhancement/enhancement.provider.ts','src/image-enhancement/enhancement.service.ts','src/image-enhancement/segmentation-isolate.ts',
 'src/ai/recognition-budget.service.ts','src/product-intake/intake-enhancement.controller.ts','src/common/constants/permissions.constants.ts','src/permissions/permissions.catalog.ts',
 'prisma/migrations/20261122000100_gemini_brand_studio/migration.sql','.env.phase7-2.example','tests/unit/gemini-brand-studio.spec.ts',
 'tests/admin-console-flow.e2e-spec.ts','tests/customer-account-deletion.e2e-spec.ts',
 ...['qa','checks','pilot','protected-audit','migration-upgrade','evidence'].map(n=>'scripts/phase7-2-'+n+'.cjs'),
 'docs/rezona-phase-7-2-gemini-brand-image-editing.md'];
const mobile=['apps/admin_app/lib/features/product_intake/intake_repository.dart','apps/admin_app/lib/features/product_intake/intake_enhancement_card.dart',
 'apps/admin_app/test/intake_enhancement_test.dart','apps/admin_app/test/intake_brand_studio_card_test.dart'];
const files=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(path.join(dir,x.name)):[path.join(dir,x.name)]);
const item=(file,base)=>({file:path.relative(base,file).replaceAll('\\','/'),bytes:fs.statSync(file).size,sha256:hash(file)});
const sources=names.map(n=>item(path.join(root,n),root)),mobileRoot=path.resolve(root,'../AboEssaMobile');
const mobileSources=mobile.map(n=>item(path.join(mobileRoot,n),mobileRoot));
const pilots=fs.readdirSync(qa).filter(n=>n.startsWith('pilot-'));
const privateManifests=[];
for(const pilot of pilots){const dir=path.join(qa,pilot),contents=files(dir).filter(p=>!path.basename(p).startsWith('evidence-')).map(f=>item(f,dir));
 const target=path.join(dir,'evidence-'+Date.now()+'.json');fs.writeFileSync(target,JSON.stringify({private:true,files:contents},null,2),{flag:'wx'});
 privateManifests.push({privateFolder:dir,manifestSha256:hash(target),fileCount:contents.length});}
const target=path.join(out,'evidence-'+Date.now()+'.json');
fs.writeFileSync(target,JSON.stringify({runId,scope:'Local mock QA only; not a signed release attestation',liveCalls:0,sourceFiles:sources,mobileSourceFiles:mobileSources,
 evidenceFiles:files(out).map(f=>item(f,out)),privateManifests,finalBuild:'v6',compiledCriticalFiles:files(path.join(qa,'v6/dist/src/image-enhancement')).map(f=>item(f,path.join(qa,'v6/dist')))},null,2),{flag:'wx'});
console.log(JSON.stringify({manifest:target,sourceFiles:sources.length+mobileSources.length,privatePilots:pilots.length}));
