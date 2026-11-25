const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),mobile=path.resolve(root,'../AboEssaMobile'),m=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync('D:/rezona-real-fal-qa/current.json','utf8')).manifest,'utf8')),p=JSON.parse(fs.readFileSync(m.priorManifest,'utf8')),sec=JSON.parse(fs.readFileSync(path.join(p.dir,'runtime-secrets.json'),'utf8'));
const env={...process.env,PRODUCT_STUDIO_ENABLED:'false',PRODUCT_STUDIO_PREPAID_EXPERIMENT:'false',PRODUCT_STUDIO_LIVE_APPROVED:'false',AI_LIVE_CALLS_APPROVED:'false',IMAGE_AI_LIVE_APPROVED:'false',REAL_PRODUCT_STUDIO_REVIEW_ENABLED:'false',PUSH_PROVIDER:'disabled'};
for(const k of['FAL_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','REAL_STUDIO_SCREENSHOTS','REAL_STUDIO_RENDER_RUNTIME','REAL_STUDIO_ADMIN_EVIDENCE'])delete env[k];
let failed=false;
function run(name,exe,args,cwd=root,extra={}){const at=Date.now(),r=spawnSync(exe,args,{cwd,env:{...env,...extra},windowsHide:true,shell:exe.endsWith('.bat'),encoding:'utf8',timeout:600000,maxBuffer:48*1024*1024}),log=((r.stdout??'')+'\n'+(r.stderr??'')).replaceAll(sec.postgresPassword,'[REDACTED]').replaceAll(sec.password,'[REDACTED]');fs.writeFileSync(path.join(m.out,name+'-'+at+'.log'),log,{flag:'wx'});const summary={name,passed:r.status===0,exitCode:r.status,durationMs:Date.now()-at,tail:log.trim().split(/\r?\n/).slice(-9)};fs.writeFileSync(path.join(m.out,name+'-'+at+'.json'),JSON.stringify(summary,null,2),{flag:'wx'});console.log(JSON.stringify(summary));if(!summary.passed)failed=true;}
if(process.argv[2]==='backend'){
 run('backend-unit',process.execPath,['node_modules/jest/bin/jest.js','tests/unit','--runInBand'],root,{NODE_OPTIONS:'--require '+path.join(root,'scripts/studio20-network-fence.cjs')});
 run('typecheck',process.execPath,['node_modules/typescript/bin/tsc','--noEmit']);
 run('lint',process.execPath,['node_modules/eslint/bin/eslint.js','src/image-enhancement/*.ts','src/ai/recognition-budget.service.ts','src/product-intake/intake-enhancement.controller.ts','tests/unit/original-reference-studio.spec.ts','tests/unit/real-studio-review.spec.ts']);
}else if(process.argv[2]==='native'){
 run('backend-native-recheck',process.execPath,['node_modules/jest/bin/jest.js','tests/unit/tabletop-placement.spec.ts','--runInBand'],root,{NODE_OPTIONS:'--require '+path.join(root,'scripts/studio20-network-fence.cjs')});
}else if(process.argv[2]==='mobile'){
 const flutter='C:/Users/3ma/develop/flutter/bin/flutter.bat';
 run('admin-tests',flutter,['test','--no-pub'],path.join(mobile,'apps/admin_app'));
 run('admin-analysis',flutter,['analyze','--no-pub'],path.join(mobile,'apps/admin_app'));
}else throw Error('UNKNOWN_MODE');
process.exitCode=failed?1:0;
