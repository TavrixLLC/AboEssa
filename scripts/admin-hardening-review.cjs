// Preparation only. No production mutations, inference, push or device installation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),mobile=path.resolve(root,'../AboEssaMobile'),base='D:/rezona-admin-hardening',mode=process.argv[2];
const sha=b=>createHash('sha256').update(b).digest('hex');
const save=(p,x)=>fs.writeFileSync(p,typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x,null,2),{flag:'wx'});
const cleanEnv={...process.env};for(const k of Object.keys(cleanEnv))if(/FAL_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|KEYSTORE.*PASSWORD|KEY_PASSWORD|^ADMIN_QA_DATABASE_URL$|^ACCOUNT_QA_DATABASE_URL$|^DATABASE_URL/.test(k))delete cleanEnv[k];
function exec(exe,args,cwd=root,extra={}){return spawnSync(exe,args,{cwd,env:{...cleanEnv,npm_config_fetch_timeout:'15000',npm_config_fetch_retries:'0',...extra},windowsHide:true,encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024});}
function snapshot(repo){const r=exec('git',['ls-files','--cached','--others','--exclude-standard','-z'],repo);assert.equal(r.status,0);const files=[...new Set(r.stdout.split('\0').filter(Boolean))].filter(n=>!/^((node_modules|build|backups|uploads|tools|\.git)(\/|$))|(^|\/)(\.env(?:\..*)?|key\.properties|local\.properties)$|\.(?:jks|keystore|p12|pem|key|dpapi)$/.test(n)).filter(n=>fs.existsSync(path.join(repo,n))&&fs.statSync(path.join(repo,n)).isFile()).map(n=>({path:n,sha256:sha(fs.readFileSync(path.join(repo,n)))}));return{head:exec('git',['rev-parse','HEAD'],repo).stdout.trim(),status:exec('git',['status','--porcelain=v1'],repo).stdout.trim().split(/\r?\n/),files};}
if(mode==='init'){
 const id=randomUUID().slice(0,8),dir=path.join(base,'run-'+id),out=path.join(root,'docs/benchmarks/admin-production-hardening',id);
 fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(out,{recursive:true});
 const m={id,dir,out,at:new Date().toISOString(),timezone:'Asia/Baghdad',productionCutoverAuthorized:false,previousEvidence:'admin-production-release/c779e61a',proposedAdminVersion:'1.1.0+3'};
 save(path.join(dir,'manifest.json'),m);save(path.join(base,'active.json'),{manifest:path.join(dir,'manifest.json')});
 save(path.join(out,'source-before.json'),{backend:snapshot(root),mobile:snapshot(mobile)});
 for(const f of['rezona-admin-production-release-readiness.md','rezona-admin-production-runbook.md'])save(path.join(dir,'prior-'+f),fs.readFileSync(path.join(root,'docs',f)));
 console.log(JSON.stringify(m));process.exit(0);
}
const m=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(path.join(base,'active.json'),'utf8')).manifest,'utf8'));
function check(name,exe,args,cwd=root,env={}){const at=Date.now(),r=exec(exe,args,cwd,env),log=(r.stdout??'')+'\n'+(r.stderr??'');save(path.join(m.out,name+'-'+at+'.log'),log);const x={name,passed:r.status===0,exitCode:r.status,durationMs:Date.now()-at,tail:log.trim().split(/\r?\n/).slice(-10)};save(path.join(m.out,name+'-'+at+'.json'),x);console.log(JSON.stringify(x));return x;}
if(mode==='audit')for(const omit of[false,true]){const at=Date.now(),r=exec('cmd.exe',['/d','/s','/c','npm audit --json'+(omit?' --omit=dev':'')]);const x=JSON.parse(r.stdout);save(path.join(m.out,'audit-'+(omit?'production':'all')+'-'+at+'.json'),x);console.log(JSON.stringify({omit,metadata:x.metadata,error:x.error}));}
else if(mode==='backend'){
 const env={NODE_ENV:'test',PRODUCT_STUDIO_DISPATCH_ENABLED:undefined,NODE_OPTIONS:'--require '+path.join(root,'scripts/studio20-network-fence.cjs')};
 const results=[check('unit',process.execPath,['node_modules/jest/bin/jest.js','tests/unit','--runInBand'],root,env),check('typecheck',process.execPath,['node_modules/typescript/bin/tsc','--noEmit']),check('lint',process.execPath,['node_modules/eslint/bin/eslint.js','src/files/minio-storage.provider.ts','tests/unit/minio-s3-storage.spec.ts'])];process.exitCode=results.every(x=>x.passed)?0:1;
}else if(mode==='build'){
 const dir=path.join(m.dir,'dist-v1');assert.ok(!fs.existsSync(dir));process.exitCode=check('backend-build',process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.build.json','--outDir',dir,'--incremental','false']).passed?0:1;
}else if(mode==='mobile'){
 const flutter='C:/Users/3ma/develop/flutter/bin/flutter.bat';
 const results=[check('admin-analyze','cmd.exe',['/d','/c',flutter,'analyze','--no-pub'],path.join(mobile,'apps/admin_app')),check('admin-tests','cmd.exe',['/d','/c',flutter,'test','--no-pub','--reporter','expanded'],path.join(mobile,'apps/admin_app')),check('customer-tests','cmd.exe',['/d','/c',flutter,'test','--no-pub','--reporter','expanded'],path.join(mobile,'apps/customer_app'))];process.exitCode=results.every(x=>x.passed)?0:1;
}else if(mode==='linux'||mode==='linux-v2'){
 const version=mode==='linux'?'v1':'v2',tag=mode==='linux'?m.id:m.id+'-v2';
 const dir=path.join(m.dir,'linux-context-'+version);assert.ok(!fs.existsSync(dir));fs.mkdirSync(dir);
 const file=path.join(m.dir,'backend-source-'+version+'.tar'),contents=['package.json','package-lock.json','tsconfig.json','tsconfig.build.json','nest-cli.json','Dockerfile','.dockerignore','src','prisma/schema.prisma','prisma/migrations','docker','public/legal'];
 assert.ok(check('archive-source', 'tar.exe',['-cf',file,...contents]).passed);
 assert.ok(check('unpack-source','tar.exe',['-xf',file,'-C',dir]).passed);
 save(path.join(m.out,'source-candidate-'+version+'.json'),{file,sha256:sha(fs.readFileSync(file)),contents,production:false,supersedes:version==='v2'?'source-candidate.json':null});
 process.exitCode=check('linux-image-build-'+version,'docker',['build','--progress=plain','-t','rezona-admin-rc:'+tag,dir]).passed?0:1;
}else if(mode==='snapshot')save(path.join(m.out,'source-current-'+Date.now()+'.json'),{backend:snapshot(root),mobile:snapshot(mobile)});
else throw Error('UNKNOWN_MODE');
