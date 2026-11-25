// Dedicated disposable resources; never runs against Phase71's six real records.
if(process.env.REZONA_PHASE72_QA!=='1')throw Error('Explicit Phase72 QA opt-in required');
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),mode=process.argv[2]??'prepare';
let runId=process.argv[3];
if(mode==='prepare')runId='20261122-'+randomUUID().slice(0,8);
if(!/^20261122-[a-f0-9]{8}$/.test(runId??''))throw Error('Explicit Phase72 run ID required');
const buildId=process.env.PHASE72_BUILD??'v6';
if(!/^v[1-9][0-9]*$/.test(buildId))throw Error('Invalid immutable build ID');
const qa=path.join('D:/rezona-phase7-2-qa',runId),out=path.join(root,'docs/benchmarks/phase7-2',runId),dist=path.join(qa,buildId,'dist');
const secretFile=path.join(qa,'runtime-secrets.json');
const secrets=mode==='prepare'?{postgresPassword:randomUUID()+randomUUID(),minioPassword:randomUUID()+randomUUID()}:
 JSON.parse(fs.readFileSync(secretFile,'utf8'));
const dburl=name=>`postgresql://phase72_qa:${encodeURIComponent(secrets.postgresPassword)}@127.0.0.1:55454/${name}`;
function run(exe,args,env={},cwd=root,input){const r=spawnSync(exe,args,{cwd,env:{...process.env,...env},input,encoding:'utf8',windowsHide:true,timeout:300000,maxBuffer:64*1024*1024});
 if(r.status!==0)throw Error((r.stderr||r.stdout||r.error?.message).slice(-8000));return r.stdout;}
function write(name,value){fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2),{flag:'wx'});}
const containers=['postgres','redis','minio'].map(x=>'rezona-phase72-qa-'+x);
if(mode==='prepare'){
 if(fs.existsSync(qa)||fs.existsSync(out))throw Error('No-overwrite QA destination');
 const existing=run('docker',['ps','-a','--format','{{.Names}}']).trim().split(/\r?\n/);
 if(containers.some(x=>existing.includes(x)))throw Error('Refuse reuse of existing Phase72 containers');
 fs.mkdirSync(qa,{recursive:true});fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(secretFile,JSON.stringify(secrets),{flag:'wx',mode:0o600});
 run('docker',['run','-d','--name',containers[0],'-e','POSTGRES_USER=phase72_qa','-e','POSTGRES_PASSWORD='+secrets.postgresPassword,'-e','POSTGRES_DB=rezona_phase72_qa','-p','127.0.0.1:55454:5432','postgres:16-alpine']);
 run('docker',['run','-d','--name',containers[1],'-p','127.0.0.1:56394:6379','redis:7-alpine']);
 run('docker',['run','-d','--name',containers[2],'-e','MINIO_ROOT_USER=phase72-qa','-e','MINIO_ROOT_PASSWORD='+secrets.minioPassword,'-p','127.0.0.1:59054:9000','minio/minio:RELEASE.2025-09-07T16-13-09Z','server','/data']);
 const migration=run(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',path.join(root,'prisma/schema.prisma')],{DATABASE_URL:dburl('rezona_phase72_qa')},qa);
 run('docker',['exec',containers[0],'createdb','-U','phase72_qa','rezona_phase72_e2e']);
 const e2eMigration=run(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',path.join(root,'prisma/schema.prisma')],{DATABASE_URL:dburl('rezona_phase72_e2e')},qa);
 write('migrations.json',{runId,scope:'Fresh dedicated disposable databases, no protected DB writes',migration,e2eMigration});
 write('run.json',{runId,qa,out,containers,liveCalls:0,productionTouched:false});
 console.log(JSON.stringify({runId,qa,out}));process.exit(0);
}
if(!fs.existsSync(path.join(out,'run.json'))||fs.existsSync(path.join(qa,'.env')))throw Error('Unknown/unsafe QA run');
if(mode==='build'){
 if(fs.existsSync(dist))throw Error('Immutable versioned build already exists');
 fs.mkdirSync(dist,{recursive:true});
 const log=run(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.build.json'),'--outDir',dist,'--incremental','false']);
 write('build-'+buildId+'.json',{passed:true,dist,log});console.log('Separate immutable QA build complete');process.exit(0);
}
if(mode==='mobile'){
 const mobile=path.resolve(root,'../AboEssaMobile'),results=[];
 for(const [name,dir,args] of [['admin-analyze','apps/admin_app',['analyze','--no-pub']],
   ['admin-tests','apps/admin_app',['test','--no-pub','--reporter','expanded']],
   ['customer-tests','apps/customer_app',['test','--no-pub','--reporter','expanded']],
   ['shared-ui-tests','packages/shared_ui',['test','--no-pub','--reporter','expanded']],
   ['api-client-tests','packages/api_client',['test','--no-pub','--reporter','expanded']]]){
   console.log('Running '+name);const began=Date.now();
   const r=spawnSync('cmd.exe',['/d','/c','C:/Users/3ma/develop/flutter/bin/flutter.bat',...args],{cwd:path.join(mobile,dir),env:process.env,encoding:'utf8',windowsHide:true,timeout:300000,maxBuffer:32*1024*1024});
   const log=(r.stdout??'')+'\n'+(r.stderr??'');fs.writeFileSync(path.join(out,name+'-'+Date.now()+'.log'),log,{flag:'wx'});
   const row={name,passed:r.status===0,exitCode:r.status,durationMs:Date.now()-began,summary:log.trim().split(/\r?\n/).slice(-8)};results.push(row);console.log(JSON.stringify(row));
 }
 write('mobile-'+Date.now()+'.json',{results,passed:results.every(x=>x.passed)});process.exit(results.every(x=>x.passed)?0:1);
}
if(mode==='unit'||mode==='e2e'||mode==='lint'){
 const database=dburl('rezona_phase72_e2e');
 const args=mode==='lint'?[path.join(root,'node_modules/eslint/bin/eslint.js'),'src/image-enhancement/*.ts','src/ai/recognition-budget.service.ts','src/product-intake/intake-enhancement.controller.ts']:
  [path.join(root,'node_modules/jest/bin/jest.js'),...(mode==='unit'?['tests/unit']:['--config','tests/jest-e2e.json']),'--runInBand'];
 const r=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,REZONA_PHASE72_QA:'1',RUN_DB_E2E:'true',
   DATABASE_URL_TEST:database,ADMIN_QA_DATABASE_URL:database,ACCOUNT_QA_DATABASE_URL:database,
   GEMINI_BRAND_STUDIO_ENABLED:'false',AI_LIVE_CALLS_APPROVED:'false'},encoding:'utf8',windowsHide:true,timeout:300000,maxBuffer:32*1024*1024});
 fs.writeFileSync(path.join(out,mode+'-'+randomUUID().slice(0,6)+'.log'),(r.stdout??'')+'\n'+(r.stderr??''),{flag:'wx'});
 write(mode+'-'+Date.now()+'.json',{exitCode:r.status,passed:r.status===0,summary:((r.stdout??'')+'\n'+(r.stderr??'')).trim().split(/\r?\n/).slice(-12)});
 console.log(((r.stdout??'')+'\n'+(r.stderr??'')).slice(-4000));process.exit(r.status??1);
}
if(!['checks','intake','commerce','recognition','legacy','pilot'].includes(mode))throw Error('Invalid QA mode');
// Reuse unchanged regression modules with this versioned compiled tree, never root live dist.
const Module=require('node:module'),resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...args){if(request.startsWith('../dist/'))request=path.join(dist,request.slice(8));return resolve.call(this,request,parent,...args);};
process.env.NODE_PATH=dist+path.delimiter+path.join(root,'node_modules');Module._initPaths();
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:dburl('rezona_phase72_qa'),REDIS_URL:'redis://127.0.0.1:56394',
 MINIO_ENDPOINT:'127.0.0.1',MINIO_PORT:'59054',MINIO_USE_SSL:'false',MINIO_ACCESS_KEY:'phase72-qa',MINIO_SECRET_KEY:secrets.minioPassword,MINIO_BUCKET:'phase72-qa',
 JWT_ADMIN_ACCESS_SECRET:randomUUID()+randomUUID(),JWT_CUSTOMER_ACCESS_SECRET:randomUUID()+randomUUID(),PUSH_PROVIDER:'disabled',
 API_PREFIX:'api',PUBLIC_BASE_URL:'http://127.0.0.1:18497',THROTTLE_LIMIT:'20000',IMAGE_OPTIMIZATION_ENABLED:'true',
 INVENTORY_MANAGEMENT_ENABLED:'true',RAPID_PRODUCT_INTAKE_ENABLED:'true',IMAGE_ENHANCEMENT_ENABLED:'true',IMAGE_ENHANCEMENT_LOCAL_ENABLED:'true',
 IMAGE_LOCAL_MATTING_ENABLED:'true',IMAGE_NEURAL_SEGMENTATION_ENABLED:'true',IMAGE_SEGMENTATION_MODEL:'u2net',
 IMAGE_SEGMENTATION_MODEL_DIRECTORY:'D:/rezona-phase7-1-qa/models',IMAGE_SEGMENTATION_RUNTIME_DIRECTORY:'D:/rezona-phase7-1-qa/runtime',
 IMAGE_AI_ENABLED:'true',IMAGE_AI_PROVIDER:'mock',IMAGE_AI_LIVE_APPROVED:'false',AI_RECOGNITION_ENABLED:['intake','commerce'].includes(mode)?'false':'true',AI_RECOGNITION_PROVIDER:'mock',
 GEMINI_BRAND_STUDIO_ENABLED:'true',GEMINI_BRAND_STUDIO_PROVIDER:'mock',GEMINI_BRAND_STUDIO_LIVE_APPROVED:'false',
 GEMINI_BRAND_STUDIO_PRIVATE_TRANSFER_APPROVED:'false',GEMINI_BRAND_STUDIO_MONTHLY_BUDGET_USD:'0',GEMINI_BRAND_STUDIO_PILOT_BUDGET_USD:'0',
 AI_LIVE_CALLS_APPROVED:'false',AI_MONTHLY_BUDGET_USD:'0',AI_DAILY_BUDGET_USD:'0',
 IMAGE_AI_DAILY_LIMIT:'1000',IMAGE_AI_EMPLOYEE_DAILY_LIMIT:'100',IMAGE_AI_EMPLOYEE_HOURLY_LIMIT:'30',
 AI_DAILY_REQUEST_LIMIT:'1000',AI_EMPLOYEE_DAILY_LIMIT:'1000',AI_MODEL_DAILY_LIMIT:'1000',AI_EMPLOYEE_HOURLY_LIMIT:'100'});
delete process.env.GEMINI_API_KEY;delete process.env.FAL_KEY;delete process.env.GOOGLE_API_KEY;
process.chdir(qa);
// Hard QA network fence: external inference is forbidden even if a flag is accidentally changed.
const fetch0=global.fetch;global.fetch=(url,...rest)=>{if(new URL(String(url)).origin!=='http://127.0.0.1:18497')throw Error('PHASE72_EXTERNAL_FETCH_FORBIDDEN');return fetch0(url,...rest);};
require('reflect-metadata');
(async()=>{
 const {NestFactory}=require('@nestjs/core'),{ValidationPipe}=require('@nestjs/common');
 const {AppModule}=require(path.join(dist,'src/app.module')),{PrismaService}=require(path.join(dist,'src/prisma/prisma.service'));
 const app=await NestFactory.create(AppModule,{logger:['error','warn']});app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
 app.useGlobalFilters(new (require(path.join(dist,'src/common/filters/http-exception.filter')).HttpExceptionFilter)());
 app.useGlobalInterceptors(new (require(path.join(dist,'src/common/interceptors/response-envelope.interceptor')).ResponseEnvelopeInterceptor)());
 await app.listen(18497,'127.0.0.1');
 try{
 const db=app.get(PrismaService),tokens=app.get(require(path.join(dist,'src/auth/token.service')).TokenService);
 const email='phase72-'+randomUUID()+'@example.test',password=randomUUID()+':Aa9!',owner=await db.adminUser.create({data:{email,normalizedEmail:email,name:'PHASE72 disposable QA owner',role:'OWNER',isOwner:true,
   passwordHash:await app.get(require(path.join(dist,'src/common/security/password.service')).PasswordService).hash(password)}});
 // Normal authenticated HTTP tokens; no fixture product bypass of Phase5 service.
 const login=await fetch0('http://127.0.0.1:18497/api/admin/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
 const logged=await login.json();
 if(!login.ok || !logged.data?.accessToken)throw Error('Normal isolated admin login failed: '+login.status);
 const ownerToken=logged.data.accessToken;
 const customer=await db.customer.create({data:{displayName:'P72 synthetic buyer',phone:'+1559'+Date.now(),wallet:{create:{availableBalance:200000}}}}),customerToken=await tokens.signCustomerAccess(customer);
 const request=async(method,url,body,token=ownerToken,key)=>{const multipart=body instanceof FormData;const r=await fetch('http://127.0.0.1:18497/api'+url,{method,
   headers:{...(!multipart?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`} : {}),...(key?{'Idempotency-Key':key}:{})},
   body:body===undefined?undefined:multipart?body:JSON.stringify(body)});const value=await r.json();return{status:r.status,data:value.data,body:value,headers:Object.fromEntries(r.headers)};};
 const category=await db.category.create({data:{name:'P72 QA '+randomUUID(),slug:'p72-'+randomUUID()}}),checks=[];
 const context={app,db,request,owner,admin:owner,ownerToken,customer,customerToken,category,checks,origin:'http://127.0.0.1:18497',out,qa,runId,
   delivery:{fullName:'QA',phone:'+15550100000',governorate:'QA',city:'QA',addressLine:'QA only'}};
 await require(mode==='intake'?'./phase5-intake-checks.cjs':mode==='commerce'?'./phase4-inventory-checks.cjs':mode==='recognition'?'./phase6-recognition-checks.cjs':mode==='legacy'?'./phase7-enhancement-checks.cjs':
   mode==='pilot'?'./phase7-2-pilot.cjs':'./phase7-2-checks.cjs')(context);
 write(mode+'-'+Date.now()+'.json',{passed:true,buildId,runId,scope:'New isolated QA services, real HTTP/storage/jobs; mock inference only',liveCalls:0,normalLoginStatus:login.status,checks});
 console.log(JSON.stringify({passed:true,mode,checks},null,2));
 }finally{await app.close();}
})().catch(e=>{write('failed-'+mode+'-'+Date.now()+'.json',{passed:false,buildId,error:e.message});console.error(e);process.exit(1);});
