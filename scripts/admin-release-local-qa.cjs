// New local synthetic QA namespace only. NOT a restored production staging environment.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),m=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync('D:/rezona-admin-release/active.json','utf8')).manifest,'utf8')),
 prior=JSON.parse(fs.readFileSync('D:/rezona-real-studio-qa/manifest.json','utf8')),sec=JSON.parse(fs.readFileSync(path.join(prior.dir,'runtime-secrets.json'),'utf8')),
 db='rezona_real_studio_reg_'+m.id,container='rezona-real-studio-qa-'+prior.id+'-postgres',mode=process.argv[2];
assert.match(db,/^rezona_real_studio_reg_[a-f0-9]{8}$/);assert.equal(prior.id,'3bbbdf05');
const save=(name,x)=>fs.writeFileSync(path.join(m.out,name),JSON.stringify(x,null,2),{flag:'wx'});
const env={...process.env,NODE_ENV:'test',DATABASE_URL:`postgresql://real_studio_qa:${encodeURIComponent(sec.postgresPassword)}@127.0.0.1:55456/${db}`};
for(const k of['FAL_KEY','GEMINI_API_KEY','GOOGLE_API_KEY'])delete env[k];
function run(exe,args,extra={}){const r=spawnSync(exe,args,{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:24*1024*1024,...extra});assert.equal(r.status,0,(r.stderr??'').toString().replaceAll(sec.postgresPassword,'[REDACTED]'));return r.stdout;}
if(mode==='init'){
 const file=path.join(m.dir,'qa-manifest.json');assert.ok(!fs.existsSync(file));
 const empty=run('docker',['exec','rezona-real-studio-qa-'+prior.id+'-redis','redis-cli','-n','14','DBSIZE']).trim();assert.equal(empty,'0','Fresh QA Redis namespace must be empty');
 run('docker',['exec',container,'createdb','-U','real_studio_qa',db]);
 const log=run(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy']);
 assert.ok(!fs.existsSync(path.join(m.dir,'dist-v1')));fs.cpSync(path.join(m.dir,'backend-dist'),path.join(m.dir,'dist-v1'),{recursive:true,errorOnExist:true,force:false});
 fs.writeFileSync(path.join(m.dir,'runtime-secrets.json'),JSON.stringify(sec),{flag:'wx'});
 fs.writeFileSync(file,JSON.stringify({id:m.id,dir:m.dir,out:m.out,regressionDb:db}),{flag:'wx'});
 save('local-fresh-migrations.json',{at:new Date().toISOString(),database:db,migrationCount:fs.readdirSync(path.join(root,'prisma/migrations'),{withFileTypes:true}).filter(x=>x.isDirectory()).length,passed:true,productionClone:false,log});
 console.log(JSON.stringify({localSyntheticQa:true,database:db,migrations:40,redisDb:14}));
}else if(['commerce','intake','studio','stage-a'].includes(mode)){
 process.env.PRODUCT_STUDIO_DISPATCH_ENABLED='true';process.env.REAL_STUDIO_BUILD='v1';
 // Reuse the inspected existing integration runner/checks without changing any business test.
 // Only substitute the manifest, loopback port and Redis namespace in a retained adapter.
 const original=fs.readFileSync(path.join(root,'scripts/real-studio-business-regression.cjs'),'utf8');
 assert.ok(original.includes('D:/rezona-real-studio-qa/manifest.json'));
 let code=original.replace('D:/rezona-real-studio-qa/manifest.json',path.join(m.dir,'qa-manifest.json').replaceAll('\\','/')).replaceAll('56396/1','56396/14').replaceAll('18526','18536');
 if(mode==='stage-a')code=code.replace("['commerce', 'intake','studio']","['commerce', 'intake','studio','stage-a']").replace("'./phase5-intake-checks.cjs'","'./admin-release-stage-a-checks.cjs'");
 fs.writeFileSync(path.join(m.dir,'runner-'+mode+'.cjs'),code,{flag:'wx'});
 process.argv[2]=mode;
 const Module=require('node:module'),adapted=new Module(path.join(root,'scripts/admin-release-adapted-'+mode+'.cjs'),module);adapted.filename=path.join(root,'scripts/admin-release-adapted-'+mode+'.cjs');adapted.paths=module.paths;adapted._compile(code,adapted.filename);
}else if(['e2e','e2e-full'].includes(mode)){
 const qa=mode==='e2e-full'?{ADMIN_QA_DATABASE_URL:env.DATABASE_URL,ACCOUNT_QA_DATABASE_URL:env.DATABASE_URL,REZONA_REAL_STUDIO_QA:'1'}:{};
 const at=Date.now(),r=spawnSync(process.execPath,['node_modules/jest/bin/jest.js','--config','tests/jest-e2e.json','--runInBand'],{cwd:root,env:{...env,...qa,DATABASE_URL_TEST:env.DATABASE_URL,RUN_DB_E2E:'true',NODE_OPTIONS:'--require '+path.join(root,'scripts/studio20-network-fence.cjs')},encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:24*1024*1024});
 const log=((r.stdout??'')+'\n'+(r.stderr??'')).replaceAll(sec.postgresPassword,'[REDACTED]');
 fs.writeFileSync(path.join(m.out,'local-'+mode+'-'+at+'.log'),log,{flag:'wx'});
 save('local-'+mode+'-'+at+'.json',{passed:r.status===0,exitCode:r.status,database:db,productionClone:false,summary:log.trim().split(/\r?\n/).slice(-8)});
 console.log(JSON.stringify({mode:'e2e',exitCode:r.status,summary:log.trim().split(/\r?\n/).slice(-8)}));assert.equal(r.status,0);
}else if(mode==='verify-restore'){
 const restoreDb='rezona_admin_restore_'+m.id;assert.match(restoreDb,/^rezona_admin_restore_[a-f0-9]{8}$/);
 const sql=`SELECT json_build_object('products',(SELECT count(*) FROM "ProductListing"),'orders',(SELECT count(*) FROM "Order"),'wallets',(SELECT count(*) FROM "CustomerWallet"),'walletEntries',(SELECT count(*) FROM "WalletEntry"),'movements',(SELECT count(*) FROM "InventoryMovement"),'balances',(SELECT count(*) FROM "InventoryBalance"),'intakeSessions',(SELECT count(*) FROM "ProductIntakeSession"),'candidates',(SELECT count(*) FROM "ProductImageEnhancementCandidate"),'decisions',(SELECT count(*) FROM "ProductImageEnhancementDecision"),'usage',(SELECT count(*) FROM "RecognitionUsage"),'available',(SELECT COALESCE(sum("availableQuantity"),0) FROM "ProductListing"),'walletAvailable',(SELECT COALESCE(sum("availableBalance"),0) FROM "CustomerWallet"));`;
 const query=name=>JSON.parse(run('docker',['exec',container,'psql','-U','real_studio_qa','-d',name,'-Atc',sql]).trim());
 const source=query(db),restored=query(restoreDb);assert.deepEqual(restored,source);
 save('local-restored-counts.json',{source:'SYNTHETIC_QA_ONLY',productionAcceptance:false,compared:true,counts:source});console.log(JSON.stringify({restoreCountsMatch:true,productionAcceptance:false}));
}else if(mode==='restore'){
 const restoreDb='rezona_admin_restore_'+m.id;assert.match(restoreDb,/^rezona_admin_restore_[a-f0-9]{8}$/);
 const dump=run('docker',['exec',container,'pg_dump','-U','real_studio_qa','-d',db,'-Fc','--no-owner','--no-acl'],{encoding:null,maxBuffer:64*1024*1024});
 const file=path.join(m.dir,'synthetic-qa-restore.dump');fs.writeFileSync(file,dump,{flag:'wx'});
 run('docker',['exec',container,'createdb','-U','real_studio_qa',restoreDb]);
 run('docker',['exec','-i',container,'pg_restore','-U','real_studio_qa','-d',restoreDb,'--no-owner','--no-acl','--exit-on-error'],{input:dump});
 const count=run('docker',['exec',container,'psql','-U','real_studio_qa','-d',restoreDb,'-Atc','SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL']).trim();assert.equal(count,'40');
 save('local-restore-rehearsal.json',{at:new Date().toISOString(),passed:true,restoredDatabase:restoreDb,migrations:40,bytes:dump.length,sha256:require('node:crypto').createHash('sha256').update(dump).digest('hex'),source:'SYNTHETIC_QA_ONLY',productionBackup:false,productionRestoreAcceptance:false});console.log(JSON.stringify({syntheticRestore:true,migrations:40,productionAcceptance:false}));
}else throw Error('UNKNOWN_MODE');
