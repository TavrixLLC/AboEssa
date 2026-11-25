// Local Docker Desktop only. A successful local envelope is NOT permission to
// provision on production, not public HTTPS/MFA acceptance, and not a peak SLO.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),id=randomUUID().slice(0,8),project='rezona-p91-'+id;
const dir='D:/rezona-phase91/run-'+id,out=path.join(root,'docs/benchmarks/phase91-envelope',id);
fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(out,{recursive:true});
const secret={pg:randomBytes(32).toString('base64url'),redis:randomBytes(32).toString('base64url'),jwtAdmin:randomBytes(48).toString('base64url'),jwtCustomer:randomBytes(48).toString('base64url'),rootKey:'operator-'+id,root:randomBytes(36).toString('base64url'),appKey:'app-'+id,app:randomBytes(36).toString('base64url'),deniedKey:'denied-'+id,denied:randomBytes(36).toString('base64url')};
const clean={...process.env};for(const k of Object.keys(clean))if(/FAL_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|JWT_|PASSWORD|SECRET|DATABASE_URL|REDIS_URL|NODE_OPTIONS/.test(k))delete clean[k];
const mask=s=>Object.values(secret).reduce((x,v)=>x.replaceAll(v,'[REDACTED]'),s);
function exec(exe,args,{env={},input,timeout=180000,allow=false}={}){return new Promise((resolve,reject)=>{
 const child=spawn(exe,args,{cwd:root,env:{...clean,...env},windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 const timer=setTimeout(()=>{child.kill();reject(Error('LOCAL_PROCESS_TIMEOUT'))},timeout);
 child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);
 child.on('close',code=>{clearTimeout(timer);const r={code,stdout,stderr};if(code!==0&&!allow)reject(Error(mask(stderr.slice(-2000)||stdout.slice(-2000)||'LOCAL_COMMAND_FAILED')));else resolve(r)});
 if(input)child.stdin.end(input);else child.stdin.end();
});}
const docker=(args,extra)=>exec('docker',args,extra);
const save=(name,x)=>fs.writeFileSync(path.join(out,name),typeof x==='string'?x:JSON.stringify(x,null,2),{flag:'wx'});
const priv=(name,text)=>fs.writeFileSync(path.join(dir,name),text,{flag:'wx'});
const sha=b=>createHash('sha256').update(b).digest('hex');
const compose=(...args)=>docker(['compose','-p',project,'-f',path.join(dir,'compose.yml'),...args]);
const names=['pg','redis','silo','api'].map(s=>project+'-'+s+'-1');
let monitor,monitorBusy=false;const samples=[];let created=false;
async function sample(label){if(monitorBusy)return;monitorBusy=true;try{const r=await docker(['stats','--no-stream','--format','{{json .}}',...names],{allow:true,timeout:12000});samples.push({at:new Date().toISOString(),label,exitCode:r.code,stats:r.stdout.split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s))});}finally{monitorBusy=false}}
async function cgroup(){const result=[];for(const name of names){const r=await docker(['exec',name,'sh','-c','for f in memory.current memory.peak memory.max memory.swap.max memory.events cpu.max cpu.stat io.stat; do printf "%s\\n" "$f"; cat /sys/fs/cgroup/$f; done'],{allow:true});result.push({name,exitCode:r.code,output:r.stdout,stderr:mask(r.stderr)});}return result;}
async function main(){
 const owner=(await exec('whoami.exe',['/user','/fo','csv','/nh'])).stdout.match(/S-1-[0-9-]+/)[0];
 await exec('icacls.exe',[dir,'/inheritance:r','/grant:r','*'+owner+':(OI)(CI)F']);
 const engine=(await docker(['info','--format','{{.OperatingSystem}}'])).stdout.trim();assert.match(engine,/Docker Desktop/);
 const expected='sha256:37dcaa839917c81b33fbd7e51915ecea8b056dde68949a8db6189469e5ac4e48';
 const image=(await docker(['image','inspect','rezona-admin-rc:130f0653-v2','--format','{{.Id}}'])).stdout.trim();assert.equal(image,expected);
 const oldArtifact=JSON.parse(fs.readFileSync(path.join(root,'docs/benchmarks/admin-production-hardening/130f0653/backend-image-artifact.json')));
 assert.equal(sha(fs.readFileSync(oldArtifact.file)),oldArtifact.sha256);
 const pgImage=(await docker(['image','inspect','postgres:16-alpine','--format','{{.Id}}'])).stdout.trim();
 const redisImage=(await docker(['image','inspect','redis:7-alpine','--format','{{.Id}}'])).stdout.trim();
 const siloImage='pgsty/silo@sha256:c20d112390b9a9ce8c11b8af95ad35bcaa62f4759663c09c936cd8d2b511f329';await docker(['image','inspect',siloImage]);
 const before=(await docker(['ps','--format','{{.Names}} {{.ID}} {{.Status}}'])).stdout;
 save('manifest.json',{id,dir,out,project,engine,image,pgImage,redisImage,siloImage,localOnly:true,at:new Date().toISOString(),sourceImageArchiveSha256:oldArtifact.sha256,syntheticDataset:true,remoteProvisioning:false,paidGeneration:false,neuralSegmentation:false});
 priv('postgres_password',secret.pg);priv('redis_password',secret.redis);
 const dburl='postgresql://postgres:'+secret.pg+'@pg:5432/live_commerce?schema=public';
 const appEnv={NODE_ENV:'production',PUBLIC_BASE_URL:'https://phase91-staging.invalid',CORS_ORIGINS:'',SWAGGER_ENABLED:'false',JWT_ADMIN_ACCESS_SECRET:secret.jwtAdmin,JWT_CUSTOMER_ACCESS_SECRET:secret.jwtCustomer,MINIO_ENDPOINT:'silo',MINIO_PORT:'9000',MINIO_USE_SSL:'false',MINIO_ACCESS_KEY:secret.appKey,MINIO_SECRET_KEY:secret.app,MINIO_BUCKET:'aboessa-media',PUSH_PROVIDER:'disabled',INVENTORY_MANAGEMENT_ENABLED:'true',RAPID_PRODUCT_INTAKE_ENABLED:'true',IMAGE_OPTIMIZATION_ENABLED:'true',IMAGE_OPTIMIZATION_CONCURRENCY:'1',IMAGE_ENHANCEMENT_ENABLED:'true',IMAGE_ENHANCEMENT_LOCAL_ENABLED:'true',IMAGE_NEURAL_SEGMENTATION_ENABLED:'false',IMAGE_AI_ENABLED:'false',AI_RECOGNITION_ENABLED:'false',AI_LIVE_CALLS_APPROVED:'false',PRODUCT_STUDIO_PROVIDER:'fal',PRODUCT_STUDIO_DISPATCH_ENABLED:'false',PRODUCT_STUDIO_ENABLED:'false',PRODUCT_STUDIO_LIVE_APPROVED:'false',PRODUCT_STUDIO_MOCK_APPROVED:'false',REAL_PRODUCT_STUDIO_REVIEW_ENABLED:'false',PRODUCT_STUDIO_PREPAID_EXPERIMENT:'false',GEMINI_BRAND_STUDIO_ENABLED:'false',FAL_BRAND_STUDIO_ENABLED:'false',NPM_CONFIG_CACHE:'/tmp/npm-cache',VIPS_CONCURRENCY:'1',MALLOC_ARENA_MAX:'2'};
 const writeEnv=(name,obj)=>priv(name,Object.entries(obj).map(([k,v])=>k+'='+v).join('\n')+'\n');
 writeEnv('api.env',appEnv);writeEnv('silo.env',{MINIO_ROOT_USER:secret.rootKey,MINIO_ROOT_PASSWORD:secret.root,MINIO_API_REQUESTS_MAX:'4'});
 writeEnv('probe.env',{NODE_PATH:'/app/node_modules',DATABASE_URL:dburl,P91_SYNTHETIC_ONLY:'true',P91_ROOT_ACCESS:secret.rootKey,P91_ROOT_SECRET:secret.root,P91_APP_ACCESS:secret.appKey,P91_APP_SECRET:secret.app,P91_DENIED_ACCESS:secret.deniedKey,P91_DENIED_SECRET:secret.denied});
 const common=`    pull_policy: never\n    restart: "no"\n    networks: [isolated]\n    pids_limit: 128\n    security_opt: ["no-new-privileges:true"]\n    logging:\n      driver: local\n      options: {max-size: "5m", max-file: "2"}\n`;
 priv('compose.yml',`name: ${project}\nservices:\n  pg:\n    image: ${pgImage}\n${common}    mem_limit: 512m\n    memswap_limit: 512m\n    cpus: 0.5\n    environment: {POSTGRES_DB: live_commerce, POSTGRES_USER: postgres, POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password}\n    volumes: ["pgdata:/var/lib/postgresql/data", "./postgres_password:/run/secrets/postgres_password:ro"]\n    command: ["postgres", "-c", "shared_buffers=64MB", "-c", "max_connections=30", "-c", "work_mem=2MB", "-c", "maintenance_work_mem=32MB"]\n  redis:\n    image: ${redisImage}\n${common}    mem_limit: 128m\n    memswap_limit: 128m\n    cpus: 0.25\n    volumes: ["redisdata:/data", "./redis_password:/run/secrets/redis_password:ro"]\n    entrypoint: ["sh", "-ec"]\n    command: ['exec redis-server --requirepass "$$(cat /run/secrets/redis_password)" --maxmemory 64mb --maxmemory-policy noeviction --appendonly yes']\n  silo:\n    image: ${siloImage}\n${common}    mem_limit: 768m\n    memswap_limit: 768m\n    cpus: 0.5\n    env_file: [silo.env]\n    volumes: ["silodata:/data"]\n    command: ["server", "/data", "--console-address", ":9001"]\n  api:\n    image: ${image}\n${common}    mem_limit: 1024m\n    memswap_limit: 1024m\n    cpus: 1.0\n    read_only: true\n    cap_drop: [ALL]\n    tmpfs: ["/tmp:size=128m,uid=1000,gid=1000,mode=1770"]\n    env_file: [api.env]\n    volumes: ["uploads:/app/uploads", "./postgres_password:/run/secrets/postgres_password:ro", "./redis_password:/run/secrets/redis_password:ro"]\n    entrypoint: ["/app/docker/api/production-entrypoint.sh"]\nnetworks:\n  isolated:\n    internal: true\nvolumes:\n  pgdata: {}\n  redisdata: {}\n  silodata: {}\n  uploads: {}\n`);
 // Candidate entrypoint deliberately resolves PostgreSQL as "postgres".
 const composePath=path.join(dir,'compose.yml');
 const generated=fs.readFileSync(composePath,'utf8');
 fs.writeFileSync(composePath,generated.replace('    networks: [isolated]','    networks:\n      isolated:\n        aliases: [postgres]'));
 await compose('config','--quiet');await compose('up','-d','pg','redis','silo');created=true;
 console.log(JSON.stringify({id,stage:'local-dependencies-started',remote:false}));
 monitor=setInterval(()=>sample('interval').catch(()=>{}),6000);
 for(let i=0;i<45;i++){if((await docker(['exec',names[0],'pg_isready','-U','postgres'],{allow:true})).code===0)break;await new Promise(r=>setTimeout(r,1000));}
 const migrationStart=Date.now();const mig=await compose('run','--rm','--no-deps','-e','ABOESSA_MIGRATION_MODE=deploy-only','api');save('synthetic-empty-migration.json',{passed:true,kind:'EMPTY_SYNTHETIC_0_TO_40_NOT_PRODUCTION_REHEARSAL',durationMs:Date.now()-migrationStart,log:mask(mig.stdout+msg(mig.stderr))});
 console.log(JSON.stringify({id,stage:'synthetic-empty-schema-ready',remote:false}));
 // Precreate bucket and restricted identities using a separate QA operator.
 const silo=names[2],mcEnv={MC_HOST_rezona:'http://'+secret.rootKey+':'+secret.root+'@127.0.0.1:9000',P91_ACCESS:secret.appKey,P91_SECRET:secret.app,P91_DENIED_ACCESS:secret.deniedKey,P91_DENIED_SECRET:secret.denied};
 for(let i=0;i<30;i++){if((await docker(['exec',silo,'silo','healthcheck','ready'],{allow:true})).code===0)break;await new Promise(r=>setTimeout(r,1000));}
 const mc=async args=>docker(['exec',...Object.keys(mcEnv).flatMap(k=>['-e',k]),silo,'mcli',...args],{env:mcEnv});
 await mc(['mb','rezona/aboessa-media']);await docker(['cp',path.join(root,'docker/minio/rezona-api-policy.json'),silo+':/tmp/policy.json']);
 await mc(['admin','policy','create','rezona','api-policy','/tmp/policy.json']);
 await docker(['exec',...Object.keys(mcEnv).flatMap(k=>['-e',k]),silo,'sh','-ec','mcli admin user add rezona "$P91_ACCESS" "$P91_SECRET"; mcli admin policy attach rezona api-policy --user "$P91_ACCESS"; mcli admin user add rezona "$P91_DENIED_ACCESS" "$P91_DENIED_SECRET"'],{env:mcEnv});
 await compose('up','-d','api');await sample('api-start');
 console.log(JSON.stringify({id,stage:'local-immutable-candidate-started',remote:false}));
 const workload=await docker(['run','--rm','--name',project+'-probe','--network',project+'_isolated','--memory','512m','--memory-swap','512m','--cpus','0.5','--pids-limit','128','--read-only','--tmpfs','/tmp:rw,size=64m','--security-opt','no-new-privileges:true','--env-file',path.join(dir,'probe.env'),'--mount','type=bind,source='+path.join(root,'scripts/phase91-local-workload.cjs')+',target=/tmp/workload.cjs,readonly','--entrypoint','node',image,'/tmp/workload.cjs'],{timeout:240000,allow:true});
 save('synthetic-workload.json',{exitCode:workload.code,passed:workload.code===0,result:workload.code===0?JSON.parse(workload.stdout.trim()):null,error:workload.code===0?null:mask(workload.stderr.slice(-3000))});
 if(workload.code!==0)throw Error('SYNTHETIC_WORKLOAD_FAILED');
 const dumpAt=Date.now();const dump=await docker(['exec',names[0],'pg_dump','-U','postgres','-d','live_commerce','--format=plain','--no-owner','--no-acl']);
 await docker(['exec',names[0],'createdb','-U','postgres','restore_probe']);
 await docker(['exec','-i',names[0],'psql','-X','-U','postgres','-d','restore_probe','-v','ON_ERROR_STOP=1'],{input:dump.stdout});
 const counts=`SELECT json_build_object('migrations',(SELECT count(*) FROM "_prisma_migrations"),'drafts',(SELECT count(*) FROM "ProductIntakeSession"),'assets',(SELECT count(*) FROM "FileAsset"),'products',(SELECT count(*) FROM "ProductListing"),'orders',(SELECT count(*) FROM "Order"));`;
 const original=JSON.parse((await docker(['exec',names[0],'psql','-X','-U','postgres','-d','live_commerce','-Atc',counts])).stdout),restored=JSON.parse((await docker(['exec',names[0],'psql','-X','-U','postgres','-d','restore_probe','-Atc',counts])).stdout);assert.deepEqual(original,restored);
 save('synthetic-db-recovery.json',{passed:true,durationMs:Date.now()-dumpAt,dumpBytes:Buffer.byteLength(dump.stdout),dumpSha256:sha(dump.stdout),original,restored,syntheticOnly:true});
 await sample('final');save('cgroup-final.json',await cgroup());
 const inspections=[];for(const name of names){const x=JSON.parse((await docker(['inspect',name,'--format','{{json .}}'])).stdout);inspections.push({name,image:x.Image,state:{status:x.State.Status,oomKilled:x.State.OOMKilled,restartCount:x.RestartCount},limits:{memory:x.HostConfig.Memory,memorySwap:x.HostConfig.MemorySwap,nanoCpus:x.HostConfig.NanoCpus,pids:x.HostConfig.PidsLimit,readOnly:x.HostConfig.ReadonlyRootfs,logging:x.HostConfig.LogConfig},networks:Object.keys(x.NetworkSettings.Networks),mounts:x.Mounts.map(v=>({type:v.Type,name:v.Name||null,destination:v.Destination})),ports:x.HostConfig.PortBindings});}
 save('enforced-local-definitions.json',inspections);
 const volumes=[];for(const s of['pg','redis','silo']){const where=s==='pg'?'/var/lib/postgresql/data':'/data';const r=await compose('exec','-T',s,'du','-sk',where);volumes.push({service:s,kib:Number(r.stdout.split(/\s+/)[0])});}save('local-data-footprint.json',volumes);
 save('summary.json',{passed:true,localOnly:true,syntheticDataset:true,productionMode:true,apiMemoryLimitMiB:1024,aggregateServicesMiB:2432,aggregateServicesCpus:2.25,transientProbeMiB:512,transientProbeCpus:0.5,neural:false,paid:false,publicHttps:false,mfa:false,production19To40Rehearsal:false,diskHardQuotaVerified:false,ioHardLimitVerified:false,remoteCreationAuthorizedByThisResult:false});
 save('prior-local-containers-before.log',before);
}
const msg=s=>s?'\n'+s:'';
main().catch(e=>{save('failure.json',{at:new Date().toISOString(),code:mask(e.code||e.message),productionWrites:0,localOnly:true});console.log(JSON.stringify({id,passed:false,code:mask(e.code||e.message)}));process.exitCode=1;}).finally(async()=>{
 clearInterval(monitor);if(created){try{save('cgroup-on-stop.json',await cgroup());await compose('stop','-t','30');save('owned-local-services-stopped.json',{names,stopped:true,volumesDeleted:false,productionTouched:false});}catch(e){save('stop-error.json',{code:mask(e.message)});}}
 save('resource-samples.json',samples);console.log(JSON.stringify({id,out,project,localOnly:true,completed:fs.existsSync(path.join(out,'summary.json')),remoteProvisioning:false}));
});
