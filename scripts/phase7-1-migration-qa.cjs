if(process.env.REZONA_PHASE71_QA!=='1')throw Error('Explicit Phase7.1 QA only');
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),target='rezona_phase71_upgrade';
function run(exe,args,input){const r=spawnSync(exe,args,{cwd:root,input,encoding:'utf8',windowsHide:true,maxBuffer:128*1024*1024,timeout:120000});if(r.status!==0)throw Error((r.stderr||r.stdout).slice(0,2000));return r.stdout;}
function sql(db,q){if(!['postgres',target,'rezona_phase71_qa'].includes(db))throw Error('Not Phase71 QA');return run('docker',['exec','-i','rezona-phase71-qa-postgres','psql','-U','phase71_qa','-d',db,'-v','ON_ERROR_STOP=1','-Atc',q]).trim();}
if(sql('postgres',`SELECT 1 FROM pg_database WHERE datname='${target}'`))throw Error('Refusing overwrite of prior QA migration evidence');
run('docker',['exec','rezona-phase71-qa-postgres','createdb','-U','phase71_qa',target]);
const wasRunning=run('docker',['inspect','--format','{{.State.Running}}','rezona-phase7-qa-postgres']).trim()==='true';
(async()=>{try{
 if(!wasRunning){run('docker',['start','rezona-phase7-qa-postgres']);for(let i=0;i<30;i++){const p=spawnSync('docker',['exec','rezona-phase7-qa-postgres','pg_isready','-U','phase7_qa'],{windowsHide:true});if(p.status===0)break;await new Promise(r=>setTimeout(r,300));}}
 // Protected Phase7 is read only. No migrations, fixtures or cleanup there.
 const dump=run('docker',['exec','rezona-phase7-qa-postgres','pg_dump','-U','phase7_qa','-d','rezona_phase7_qa','--no-owner','--no-acl']);
 run('docker',['exec','-i','rezona-phase71-qa-postgres','psql','-U','phase71_qa','-d',target,'-v','ON_ERROR_STOP=1'],dump);
}finally{if(!wasRunning)run('docker',['stop','rezona-phase7-qa-postgres']);}
const columns=sql(target,"SELECT table_name||':'||string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations' GROUP BY table_name ORDER BY table_name").split('\n').map(x=>{const [table,names]=x.split(':');if(!/^[A-Za-z0-9_,]+$/.test(table+names))throw Error('Identifier');return[table,names.split(',')];});
const fingerprints=()=>Object.fromEntries(columns.map(([table,names])=>[table,sql(target,`SELECT count(*)||':'||COALESCE(md5(string_agg(h,'' ORDER BY h)),'empty') FROM (SELECT md5(row_to_json(old)::text) h FROM (SELECT ${names.map(n=>'"'+n+'"').join(',')} FROM "${table}") old) rows`)]));
const before=fingerprints();const oldCount=sql(target,'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL');assert.equal(oldCount,'36');
const migrated=spawnSync(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy'],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,DATABASE_URL:`postgresql://phase71_qa:phase71-local-only@127.0.0.1:55452/${target}`}});if(migrated.status!==0)throw Error(migrated.stderr||migrated.stdout);
const after=fingerprints();assert.deepEqual(after,before);assert.equal(sql(target,'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),'37');assert.equal(sql('rezona_phase71_qa','SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),'37');
const report={time:new Date().toISOString(),scope:'Phase7 protected DB read-only dump into separate Phase71 upgrade DB; fresh37 separately applied',passed:true,oldColumnTables:columns.length,from:36,to:37,before,after,oldFieldsUnchanged:true,log:migrated.stdout};fs.writeFileSync(path.join(root,'docs/benchmarks/phase7-1/migrations.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,tables:columns.length,from:36,to:37}));
})().catch(e=>{console.error(e);process.exitCode=1;});
