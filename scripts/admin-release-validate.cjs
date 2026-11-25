// Local release-candidate checks only; no deploy/install, no production DB or paid provider.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),mobile=path.resolve(root,'../AboEssaMobile'),m=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync('D:/rezona-admin-release/active.json','utf8')).manifest,'utf8'));
const env={...process.env,NODE_ENV:'test',PUSH_PROVIDER:'disabled',PRODUCT_STUDIO_DISPATCH_ENABLED:'false',PRODUCT_STUDIO_ENABLED:'false',PRODUCT_STUDIO_LIVE_APPROVED:'false',REAL_PRODUCT_STUDIO_REVIEW_ENABLED:'false',PRODUCT_STUDIO_PREPAID_EXPERIMENT:'false',AI_LIVE_CALLS_APPROVED:'false',IMAGE_AI_LIVE_APPROVED:'false',npm_config_fetch_timeout:'15000',npm_config_fetch_retries:'0'};
for(const k of Object.keys(env))if(/FAL_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|^REAL_STUDIO_|^REZONA_PHASE[567]_QA$/.test(k))delete env[k];
let failed=false;
function run(name,exe,args,cwd=root,extra={}){const at=Date.now(),r=spawnSync(exe,args,{cwd,env:{...env,...extra},windowsHide:true,encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024}),log=(r.stdout??'')+'\n'+(r.stderr??'');fs.writeFileSync(path.join(m.out,name+'-'+at+'.log'),log,{flag:'wx'});const result={name,exitCode:r.status,passed:r.status===0,durationMs:Date.now()-at,summary:log.trim().split(/\r?\n/).slice(-10)};fs.writeFileSync(path.join(m.out,name+'-'+at+'.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));if(!result.passed)failed=true;return result;}
const mode=process.argv[2];
if(mode==='backend'){
 run('unit',process.execPath,['node_modules/jest/bin/jest.js','tests/unit','--runInBand'],root,{PRODUCT_STUDIO_DISPATCH_ENABLED:undefined,NODE_OPTIONS:'--require '+path.join(root,'scripts/studio20-network-fence.cjs')});
 run('typecheck',process.execPath,['node_modules/typescript/bin/tsc','--noEmit']);
 run('lint',process.execPath,['node_modules/eslint/bin/eslint.js','src/image-enhancement/studio-release-policy.ts','src/image-enhancement/studio-library.config.ts','src/config/env.validation.ts','src/admin-auth/admin-auth.controller.ts','src/admin-auth/admin-auth.module.ts','tests/unit/admin-production-release.spec.ts']);
}else if(mode==='mobile'){
 for(const [name,dir,args]of[['admin-analysis','apps/admin_app',['analyze','--no-pub']],['admin-tests','apps/admin_app',['test','--no-pub','--reporter','expanded']],['customer-regression','apps/customer_app',['test','--no-pub','--reporter','expanded']]])
 run(name,'cmd.exe',['/d','/c','C:/Users/3ma/develop/flutter/bin/flutter.bat',...args],path.join(mobile,dir));
}else if(mode==='build'){
 const dist=path.join(m.dir,'backend-dist');assert.ok(!fs.existsSync(dist));
 run('backend-build',process.execPath,['node_modules/typescript/bin/tsc','--project','tsconfig.build.json','--outDir',dist,'--incremental','false']);
 run('prisma-validate',process.execPath,['node_modules/prisma/build/index.js','validate'],root,{DATABASE_URL:'postgresql://release_validation:synthetic_only@127.0.0.1:55456/not_connected_validation'});
 const app=path.join(mobile,'apps/admin_app'),signing=fs.existsSync(path.join(app,'android/key.properties'))||['ABOESSA_KEYSTORE_PATH','ABOESSA_KEYSTORE_PASSWORD','ABOESSA_KEY_ALIAS','ABOESSA_KEY_PASSWORD'].every(k=>!!process.env[k]);
 fs.writeFileSync(path.join(m.out,'android-release-build-gate.json'),JSON.stringify({package:'com.singlestore.admin_app',currentSourceVersion:'1.0.0+2',proposedVersion:m.proposedVersion,signingConfigPresent:signing,establishedCertificateMatch:'UNVERIFIED',installedVersion:'UNVERIFIED',signedApkBuilt:false,deviceInstalled:false,reason:signing?'Signing identity and installed certificate must be independently matched before build/distribution':'No established release signing configuration; no debug/replacement key used'},null,2),{flag:'wx'});
 // Explicit source set, not a workspace tar: excludes all secrets, backups, photos, models and test fixtures.
 const tar=path.join(m.dir,'rezona-admin-backend-'+m.id+'-source.tar');assert.ok(!fs.existsSync(tar));
 const contents=['package.json','package-lock.json','tsconfig.json','tsconfig.build.json','nest-cli.json','Dockerfile','.dockerignore','src','prisma/migrations','prisma/schema.prisma','docker','public/legal'];
 run('source-candidate-archive','tar.exe',['-cf',tar,...contents]);
 if(fs.existsSync(tar))fs.writeFileSync(path.join(m.out,'source-candidate.json'),JSON.stringify({file:tar,sha256:createHash('sha256').update(fs.readFileSync(tar)).digest('hex'),contents,kind:'SOURCE_CANDIDATE_NOT_VERIFIED_LINUX_IMAGE',signedAdminApk:false,productionCutover:false},null,2),{flag:'wx'});
}else if(mode==='build-final'){
 const dist=path.join(m.dir,'backend-dist-final');assert.ok(!fs.existsSync(dist));
 run('backend-build-final',process.execPath,['node_modules/typescript/bin/tsc','--project','tsconfig.build.json','--outDir',dist,'--incremental','false']);
}else if(mode==='archive-final'){
 const file=path.join(m.dir,'rezona-admin-backend-'+m.id+'-source-final.tar');assert.ok(!fs.existsSync(file));
 const contents=['package.json','package-lock.json','prisma.config.ts','tsconfig.json','tsconfig.build.json','nest-cli.json','Dockerfile','.dockerignore','src','prisma/migrations','prisma/schema.prisma','docker','public/legal'];
 run('final-source-candidate-archive','tar.exe',['-cf',file,...contents]);
 if(fs.existsSync(file))fs.writeFileSync(path.join(m.out,'source-candidate-final.json'),JSON.stringify({file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),contents,kind:'SOURCE_RC_NOT_A_DEPLOYABLE_LINUX_IMAGE',supersedes:'source-candidate.json',version:m.proposedVersion,productionCutover:false},null,2),{flag:'wx'});
}else throw Error('UNKNOWN_MODE');
process.exitCode=failed?1:0;
