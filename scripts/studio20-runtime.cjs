// Actual isolated Nest/JWT/PostgreSQL/BullMQ/MinIO workflow; MOCK inference only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),m=JSON.parse(fs.readFileSync('D:/rezona-studio20-qa/manifest.json','utf8'));
assert.match(m.db,/^rezona_studio20_qa_[a-f0-9]{8}$/);
const secrets=JSON.parse(fs.readFileSync(path.join(m.dir,'runtime-secrets.json'),'utf8'));
const dist=process.env.STUDIO20_DIST||m.dist;
assert.ok(path.resolve(dist).startsWith(path.resolve(m.dir)+path.sep),'QA build scope');
const Module=require('node:module'),resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...args){if(request.startsWith('../dist/'))request=path.join(dist,request.slice(8));return resolve.call(this,request,parent,...args);};
process.env.NODE_PATH=dist+path.delimiter+path.join(root,'node_modules');Module._initPaths();
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:`postgresql://studio20_qa:${encodeURIComponent(secrets.postgresPassword)}@127.0.0.1:55455/${m.db}`,
 REDIS_URL:'redis://127.0.0.1:56395',MINIO_ENDPOINT:'127.0.0.1',MINIO_PORT:'59055',MINIO_USE_SSL:'false',MINIO_ACCESS_KEY:'studio20-qa',MINIO_SECRET_KEY:secrets.minioPassword,MINIO_BUCKET:'studio20-qa',
 JWT_ADMIN_ACCESS_SECRET:randomUUID()+randomUUID(),JWT_CUSTOMER_ACCESS_SECRET:randomUUID()+randomUUID(),PUSH_PROVIDER:'disabled',API_PREFIX:'api',PUBLIC_BASE_URL:'http://127.0.0.1:18523',THROTTLE_LIMIT:'20000',
 IMAGE_OPTIMIZATION_ENABLED:'true',INVENTORY_MANAGEMENT_ENABLED:'true',RAPID_PRODUCT_INTAKE_ENABLED:'true',IMAGE_ENHANCEMENT_ENABLED:'true',IMAGE_ENHANCEMENT_LOCAL_ENABLED:'true',IMAGE_LOCAL_MATTING_ENABLED:'true',
 IMAGE_NEURAL_SEGMENTATION_ENABLED:'true',IMAGE_SEGMENTATION_MODEL:'u2net',IMAGE_SEGMENTATION_MODEL_DIRECTORY:'D:/rezona-phase7-1-qa/models',IMAGE_SEGMENTATION_RUNTIME_DIRECTORY:'D:/rezona-phase7-1-qa/runtime',
 IMAGE_AI_ENABLED:'true',IMAGE_AI_PROVIDER:'mock',IMAGE_AI_LIVE_APPROVED:'false',AI_RECOGNITION_ENABLED:'false',AI_RECOGNITION_PROVIDER:'mock',AI_LIVE_CALLS_APPROVED:'false',
 GEMINI_BRAND_STUDIO_ENABLED:'false',FAL_BRAND_STUDIO_ENABLED:'false',PRODUCT_STUDIO_ENABLED:'true',PRODUCT_STUDIO_PROVIDER:'mock',PRODUCT_STUDIO_MOCK_APPROVED:'true',PRODUCT_STUDIO_LIVE_APPROVED:'false',
 IMAGE_AI_DAILY_LIMIT:'1000',IMAGE_AI_EMPLOYEE_DAILY_LIMIT:'100',IMAGE_AI_EMPLOYEE_HOURLY_LIMIT:'30'});
delete process.env.FAL_KEY;delete process.env.GEMINI_API_KEY;delete process.env.GOOGLE_API_KEY;
process.chdir(m.dir);
const origin='http://127.0.0.1:18523',fetch0=global.fetch;let externalAttempts=0;
global.fetch=(url,...rest)=>{if(new URL(String(url)).origin!==origin){externalAttempts++;throw Error('STUDIO20_EXTERNAL_NETWORK_FORBIDDEN');}return fetch0(url,...rest);};
require('reflect-metadata');
(async()=>{
 const {NestFactory}=require('@nestjs/core'),{ValidationPipe}=require('@nestjs/common'),{AppModule}=require(path.join(dist,'src/app.module'));
 const app=await NestFactory.create(AppModule,{logger:['error','warn']});app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
 const filter=new(require(path.join(dist,'src/common/filters/http-exception.filter')).HttpExceptionFilter)(),caught=filter.catch.bind(filter);
 filter.catch=(error,host)=>{if(!error.getStatus||error.getStatus()>=500){const safe=String(error.stack||error.message||error).replaceAll(secrets.postgresPassword,'[REDACTED]').replaceAll(secrets.minioPassword,'[REDACTED]');fs.writeFileSync(path.join(m.dir,'qa-error-'+Date.now()+'.txt'),safe,{flag:'wx'});}return caught(error,host);};
 app.useGlobalFilters(filter);
 app.useGlobalInterceptors(new(require(path.join(dist,'src/common/interceptors/response-envelope.interceptor')).ResponseEnvelopeInterceptor)());
 await app.listen(18523,'127.0.0.1');
 try{
  const db=app.get(require(path.join(dist,'src/prisma/prisma.service')).PrismaService),email='studio20-'+randomUUID()+'@example.test',password=randomUUID()+':Aa9!';
  const owner=await db.adminUser.create({data:{email,normalizedEmail:email,name:'STUDIO20 synthetic QA owner',role:'OWNER',isOwner:true,passwordHash:await app.get(require(path.join(dist,'src/common/security/password.service')).PasswordService).hash(password)}});
  const login=await fetch(origin+'/api/admin/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
  const logged=await login.json();assert.ok(login.ok&&logged.data?.accessToken,'Normal admin login');let token=logged.data.accessToken;
  const request=async(method,url,body,jwt=token,key)=>{const multipart=body instanceof FormData,r=await fetch(origin+'/api'+url,{method,headers:{...(!multipart?{'content-type':'application/json'}:{}),...(jwt?{authorization:`Bearer ${jwt}`} : {}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:multipart?body:JSON.stringify(body)});const b=await r.json();return{status:r.status,data:b.data,body:b,headers:Object.fromEntries(r.headers)};};
  const category=await db.category.create({data:{name:'الإلكترونيات',slug:'studio20-'+randomUUID()}});
  const customer=await db.customer.create({data:{displayName:'Studio20 synthetic buyer',phone:'+1559'+Date.now(),wallet:{create:{availableBalance:200000}}}});
  const customerToken=await app.get(require(path.join(dist,'src/auth/token.service')).TokenService).signCustomerAccess(customer);
  const checks=[],mode=process.argv[2]||'checks';
  const context={app,db,request,owner,admin:owner,ownerToken:token,customer,customerToken,category,checks,origin,out:m.out,qa:m.dir,runId:m.id,delivery:{fullName:'QA',phone:'+15550100000',governorate:'QA',city:'QA',addressLine:'Synthetic only'}};
  context.switchEmployee=async()=>{
    const mail='studio20-second-'+randomUUID()+'@example.test',pass=randomUUID()+':Aa9!';
    const actor=await db.adminUser.create({data:{email:mail,normalizedEmail:mail,name:'Studio20 second synthetic employee',role:'OWNER',isOwner:true,passwordHash:await app.get(require(path.join(dist,'src/common/security/password.service')).PasswordService).hash(pass)}});
    const login=await fetch(origin+'/api/admin/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:mail,password:pass})});const body=await login.json();assert.ok(login.ok&&body.data?.accessToken);token=body.data.accessToken;context.owner=actor;context.admin=actor;
  };
  await require(mode==='commerce'?'./phase4-inventory-checks.cjs':mode==='intake'?'./phase5-intake-checks.cjs':mode==='resilience'?'./studio20-resilience.cjs':mode==='comparisons'?'./studio20-comparisons.cjs':'./studio20-checks.cjs')(context);
  assert.equal(externalAttempts,0);fs.writeFileSync(path.join(m.out,mode+'-'+Date.now()+'.json'),JSON.stringify({passed:true,checks,externalAttempts,paidRequests:0,mockOnly:true,productionTouched:false},null,2),{flag:'wx'});
  console.log(JSON.stringify({passed:true,mode,checks,externalAttempts},null,2));
 }finally{await app.close();}
})().catch(e=>{fs.writeFileSync(path.join(m.out,'failure-'+Date.now()+'.json'),JSON.stringify({error:e.message,externalAttempts,paidCalls:0}),{flag:'wx'});console.error(e.message);process.exit(1);});
