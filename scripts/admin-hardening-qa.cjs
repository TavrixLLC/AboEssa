// Fresh local namespaces only; adapters retain all existing business assertions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),m=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync('D:/rezona-admin-hardening/active.json','utf8')).manifest,'utf8'));
const prior=JSON.parse(fs.readFileSync('D:/rezona-real-studio-qa/manifest.json','utf8')),secrets=JSON.parse(fs.readFileSync(path.join(prior.dir,'runtime-secrets.json'),'utf8'));
const db='rezona_real_studio_reg_'+m.id;assert.match(db,/^rezona_real_studio_reg_[a-f0-9]{8}$/);assert.equal(prior.id,'3bbbdf05');
const mode=process.argv[2],env={...process.env,NODE_ENV:'test',DATABASE_URL:`postgresql://real_studio_qa:${encodeURIComponent(secrets.postgresPassword)}@127.0.0.1:55456/${db}`};
for(const k of Object.keys(env))if(/FAL_KEY|GEMINI_API_KEY|GOOGLE_API_KEY/.test(k))delete env[k];
if(mode==='init'){
 const run=(exe,args)=>{const r=spawnSync(exe,args,{cwd:root,env,windowsHide:true,encoding:'utf8'});assert.equal(r.status,0,(r.stderr??'').replaceAll(secrets.postgresPassword,'[REDACTED]'));return r.stdout;};
 assert.equal(run('docker',['exec','rezona-real-studio-qa-3bbbdf05-redis','redis-cli','-n','13','DBSIZE']).trim(),'0');
 run('docker',['exec','rezona-real-studio-qa-3bbbdf05-postgres','createdb','-U','real_studio_qa',db]);
 const log=run(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy']);
 fs.writeFileSync(path.join(m.dir,'runtime-secrets.json'),JSON.stringify(secrets),{flag:'wx'});
 fs.writeFileSync(path.join(m.dir,'qa-manifest.json'),JSON.stringify({id:m.id,dir:m.dir,out:m.out,regressionDb:db}),{flag:'wx'});
 fs.writeFileSync(path.join(m.out,'fresh-qa-migrations.json'),JSON.stringify({passed:true,namespace:db,redisDb:13,migrations:40,production:false,log},null,2),{flag:'wx'});
 console.log(JSON.stringify({qa:db,redisDb:13,production:false,migrations:40}));
}else{
 assert.ok(['commerce','intake','studio','stage-a','e2e-full','restore','verify-restore'].includes(mode));
 const original=fs.readFileSync(path.join(root,'scripts/admin-release-local-qa.cjs'),'utf8');
 const code=original.replace('D:/rezona-admin-release/active.json','D:/rezona-admin-hardening/active.json').replaceAll('56396/14','56396/13').replaceAll('18536','18546');
 fs.writeFileSync(path.join(m.dir,'retained-qa-adapter-'+mode+'.cjs'),code,{flag:'wx'});
 const Module=require('node:module'),adapter=new Module(path.join(root,'scripts/admin-hardening-qa-adapted.cjs'),module);adapter.filename=path.join(root,'scripts/admin-hardening-qa-adapted.cjs');adapter.paths=module.paths;adapter._compile(code,adapter.filename);
}
