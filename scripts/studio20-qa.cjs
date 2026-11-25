// Isolated QA only. This runner NEVER reads FAL_KEY or permits provider traffic.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='D:/rezona-studio20-qa',mp=path.join(base,'manifest.json'),mode=process.argv[2],sha=b=>createHash('sha256').update(b).digest('hex');
const write=(d,n,v)=>fs.writeFileSync(path.join(d,n),typeof v==='string'?v:JSON.stringify(v,null,2),{flag:'wx'});
function command(exe,args,cwd=root,extra={}){const env={...process.env,...extra};delete env.FAL_KEY;delete env.GEMINI_API_KEY;delete env.GOOGLE_API_KEY;const r=spawnSync(exe,args,{cwd,env,windowsHide:true,encoding:'utf8',timeout:240000,maxBuffer:48*1024*1024});return{...r,log:(r.stdout??'')+'\n'+(r.stderr??'')};}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(path.join(dir,d.name)):[path.join(dir,d.name)]);}
if(mode==='init'){
 assert.ok(!fs.existsSync(mp),'No-overwrite run');fs.mkdirSync(base,{recursive:true});const id=randomUUID().slice(0,8),dir=path.join(base,'run-'+id),out=path.join(root,'docs/benchmarks/studio20',id);fs.mkdirSync(dir);fs.mkdirSync(out,{recursive:true});
 const protectedFiles=[...files(path.join(root,'src/inventory')),...files(path.join(root,'src/sales')),...files(path.join(root,'src/auctions')),...files(path.join(root,'src/shipping')),'src/product-intake/product-intake.service.ts'].map(f=>path.isAbsolute(f)?f:path.join(root,f));
 const historic=files(path.join(root,'docs/benchmarks')).filter(f=>!f.includes(path.join('benchmarks','studio20')));
 const reports=fs.readdirSync(path.join(root,'docs')).filter(n=>/^rezona-/.test(n)&&n.endsWith('.md')).map(n=>path.join(root,'docs',n));
 const baseline=[...new Set([...protectedFiles,...historic,...reports])].map(file=>({file,sha256:sha(fs.readFileSync(file))}));
 const m={id,dir,out,dist:path.join(dir,'dist'),db:'rezona_studio20_qa_'+id,regressionDb:'rezona_studio20_reg_'+id,createdAt:new Date().toISOString(),timezone:'Asia/Baghdad',externalInferenceAuthorized:0,production:'NO_GO',baseline,ports:{pg:55455,redis:56395,minio:59055,minioConsole:59056,api:18523}};
 write(base,'manifest.json',m);write(out,'manifest.json',m);
 for(const name of['AboEssa','AboEssaMobile']){const r=command('git',['status','--short'],path.resolve(root,'..',name));write(dir,name+'-initial-worktree.txt',r.log);}
 console.log(JSON.stringify({initialized:true,id,out,privateDir:dir,baselineFiles:baseline.length,paidCalls:0}));process.exit(0);
}
const m=JSON.parse(fs.readFileSync(mp,'utf8'));assert.match(m.id,/^[a-f0-9]{8}$/);assert.equal(m.db,'rezona_studio20_qa_'+m.id);
if(mode==='build'){
 const version=process.argv[3];if(version)assert.match(version,/^v[1-9][0-9]*$/);const dist=version?path.join(m.dir,'dist-'+version):m.dist;
 assert.ok(!fs.existsSync(dist),'No overwrite of compiled evidence snapshot');const r=command(process.execPath,['node_modules/typescript/bin/tsc','--project','tsconfig.build.json','--outDir',dist,'--incremental','false']);write(m.out,'build-'+Date.now()+'.log',r.log);console.log(JSON.stringify({build:r.status===0,dist}));process.exit(r.status===0?0:1);
}
if(mode==='export'){
 const dist=path.join(m.dir,'dist-'+(process.argv[3]||'v2'));const t=require(path.join(dist,'src/image-enhancement/studio-templates.js'));
 write(m.out,'registry-prompts-'+Date.now()+'.json',{systemVersion:t.STUDIO_SYSTEM_VERSION,system:t.STUDIO_SYSTEM_INSTRUCTION,templates:t.STUDIO_TEMPLATES.map(x=>({...x,promptHashes:Object.fromEntries(x.supportedModes.map(mode=>[mode,t.studioPromptHash(x,mode)]))}))});
 const fixture=path.resolve(root,'../AboEssaMobile/apps/admin_app/test/fixtures/studio20-catalog.json');fs.mkdirSync(path.dirname(fixture),{recursive:true});
 fs.writeFileSync(fixture,JSON.stringify({templates:t.studioCatalog(),groups:t.STUDIO_GROUPS.map(g=>({id:g,nameAr:t.STUDIO_GROUP_LABELS[g],count:5})),suggestion:{group:'ELECTRONICS'},cost:{provider:'mock',generationEnabled:true,reservedCeilingUsd:'0'}},null,2),{flag:'wx'});
 console.log('Authoritative catalog exported; prompts remain backend-only');process.exit(0);
}
if(mode==='services'){
 const names=['postgres','redis','minio'].map(n=>'rezona-studio20-qa-'+m.id+'-'+n);
 const existing=command('docker',['ps','-a','--format','{{.Names}}']);assert.equal(existing.status,0);
 assert.ok(names.every(n=>!existing.output?.includes(n)&&!existing.log.split(/\r?\n/).includes(n)),'Refuse reuse existing containers');
 const secrets={postgresPassword:randomUUID()+randomUUID(),minioPassword:randomUUID()+randomUUID()};write(m.dir,'runtime-secrets.json',secrets);
 for(const [name,args] of [[names[0],['-e','POSTGRES_USER=studio20_qa','-e','POSTGRES_PASSWORD='+secrets.postgresPassword,'-e','POSTGRES_DB='+m.db,'-p','127.0.0.1:55455:5432','postgres:16-alpine']], [names[1],['-p','127.0.0.1:56395:6379','redis:7-alpine']], [names[2],['-e','MINIO_ROOT_USER=studio20-qa','-e','MINIO_ROOT_PASSWORD='+secrets.minioPassword,'-p','127.0.0.1:59055:9000','-p','127.0.0.1:59056:9001','minio/minio:RELEASE.2025-09-07T16-13-09Z','server','/data','--console-address',':9001']]]){
  const r=command('docker',['run','-d','--name',name,...args]);assert.equal(r.status,0,'New isolated service failed');
 }
 write(m.out,'services-'+Date.now()+'.json',{names,ports:m.ports,reused:false,productionTouched:false});console.log('New isolated services ready');process.exit(0);
}
if(mode==='migrate'){
 const secrets=JSON.parse(fs.readFileSync(path.join(m.dir,'runtime-secrets.json'),'utf8'));
 const url=db=>`postgresql://studio20_qa:${encodeURIComponent(secrets.postgresPassword)}@127.0.0.1:55455/${db}`;
 const create=command('docker',['exec','rezona-studio20-qa-'+m.id+'-postgres','createdb','-U','studio20_qa',m.regressionDb]);assert.equal(create.status,0,'Refuse duplicate regression DB');
 for(const db of[m.db,m.regressionDb]){const r=command(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--schema',path.join(root,'prisma/schema.prisma')],root,{DATABASE_URL:url(db)});write(m.out,'migration-'+db+'-'+Date.now()+'.log',r.log.replaceAll(encodeURIComponent(secrets.postgresPassword),'[REDACTED]'));assert.equal(r.status,0,'Fresh database migration failed');}
 console.log('Fresh QA and regression DB migrations passed');process.exit(0);
}
if(mode==='baseline'){
 for(const r of m.baseline)assert.equal(sha(fs.readFileSync(r.file)),r.sha256,'Protected file changed: '+r.file);
 console.log(JSON.stringify({baselineUnchanged:true,files:m.baseline.length}));process.exit(0);
}
throw Error('INVALID_QA_MODE');
