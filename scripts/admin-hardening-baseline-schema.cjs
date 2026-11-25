// Read-only comparisons plus a NEW private expected-baseline database. Never production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),m=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync('D:/rezona-admin-hardening/active.json','utf8')).manifest,'utf8')),container='rezona-admin-restored-'+m.id,image='rezona-admin-rc:'+m.id;
const run=(args,allowed=false)=>{const r=spawnSync('docker',args,{windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});if(!allowed)assert.equal(r.status,0,r.stderr);return r;};
const rows=JSON.parse(run(['exec',container,'psql','-U','postgres','-d','rezona_staging','-Atc','SELECT json_agg(migration_name ORDER BY migration_name) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;']).stdout);assert.equal(rows.length,19);
const dir=path.join(m.dir,'expected-baseline-migrations-19');if(fs.existsSync(dir))assert.equal(fs.readdirSync(dir).length,0,'Only the previous empty failed context may be reused');else fs.mkdirSync(dir);
// Generated isolated Prisma context only; do not add or rewrite historical repository migrations.
fs.writeFileSync(path.join(dir,'migration_lock.toml'),'provider = "postgresql"\n',{flag:'wx'});
for(const name of rows){assert.match(name,/^[0-9]+_[a-z0-9_]+$/);fs.cpSync(path.join(root,'prisma/migrations',name),path.join(dir,name),{recursive:true,errorOnExist:true,force:false});}
const name='rezona_expected_baseline';run(['exec',container,'createdb','-U','postgres',name]);
run(['run','--rm','--network','container:'+container,'-e','DATABASE_URL=postgresql://postgres@127.0.0.1:5432/'+name+'?schema=public','--mount','type=bind,source='+dir+',target=/app/prisma/migrations,readonly','--entrypoint','node',image,'node_modules/prisma/build/index.js','migrate','deploy']);
const compare=run(['run','--rm','--network','container:'+container,'--entrypoint','node',image,'node_modules/prisma/build/index.js','migrate','diff','--from-url','postgresql://postgres@127.0.0.1:5432/'+name+'?schema=public','--to-url','postgresql://postgres@127.0.0.1:5432/rezona_staging?schema=public','--exit-code'],true);
const normalize=s=>s.replace(/^\\(?:un)?restrict .*$/gm,'').replace(/^-- Dumped (?:from database|by pg_dump) version.*$/gm,'').replace(/\r\n/g,'\n').trim();
const dump=n=>normalize(run(['exec',container,'pg_dump','-U','postgres','-d',n,'--schema-only','--no-owner','--no-acl']).stdout);
const expected=dump(name),actual=dump('rezona_staging'),hash=s=>createHash('sha256').update(s).digest('hex');
const x={at:new Date().toISOString(),kind:'INDEPENDENT_EXPECTED_19_VS_UNMODIFIED_FRESH_RESTORE',prismaManagedSchemaEqual:compare.status===0,prismaDiffExit:compare.status,prismaDiff:compare.stdout.trim(),fullPostgresSchemaEqual:expected===actual,expectedSchemaHash:hash(expected),restoredSchemaHash:hash(actual),normalization:'Only pg_dump restrict nonce and dump-version comments removed; no SQL rewritten',historicalRecordedChecksumStillDifferent:true,checksumRecordModified:false,productionWrites:0,requiresFormalHistoryDisposition:true};
fs.writeFileSync(path.join(m.out,'historical-schema-equivalence.json'),JSON.stringify(x,null,2),{flag:'wx'});console.log(JSON.stringify(x));
if(expected!==actual||compare.status!==0)process.exitCode=1;
