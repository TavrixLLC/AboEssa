// Explicit real-provider pilot only. No generic batch mode, customer environment, publish or submit.
if(process.env.REZONA_FAL_PILOT!=='1')throw Error('Explicit fal pilot opt-in required');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),base='D:/rezona-phase7-2-qa/fal-pilot',mode=process.argv[2]??'prepare',manifestPath=path.join(base,'pilot-manifest.json');
fs.mkdirSync(base,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const old=JSON.parse(fs.readFileSync('D:/rezona-phase7-1-qa/real-products-20261121/intake-journal.json','utf8'));
const prior=JSON.parse(fs.readFileSync('D:/rezona-phase7-2-qa/20261122-6470081b/pilot-6745d227/pilot.json','utf8'));
const photos=old.products.filter(p=>[1,5].includes(p.n));assert.equal(photos.length,2);
const cfg=JSON.parse(fs.readFileSync('D:/rezona-phase7-2-qa/20261122-6470081b/runtime-secrets.json','utf8'));
const run=(exe,args,env={},cwd=root,input)=>{const r=spawnSync(exe,args,{cwd,env:{...process.env,...env},input,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:32*1024*1024});
 if(r.status!==0)throw Error('FAL_QA_LOCAL_COMMAND_FAILED');return r.stdout;};
let manifest;
if(mode==='prepare'){
 if(fs.existsSync(manifestPath))throw Error('Existing fal pilot: do not recreate or reset');
 const id=randomUUID().slice(0,8),dir=path.join(base,'run-'+id),out=path.join(root,'docs/benchmarks/phase7-2','fal-'+id),db='rezona_phase72_fal_'+id;
 if(fs.existsSync(dir)||fs.existsSync(out))throw Error('No-overwrite pilot destination');fs.mkdirSync(dir);fs.mkdirSync(out,{recursive:true});
 run('docker',['exec','rezona-phase72-qa-postgres','createdb','-U','phase72_qa',db]);
 const url=`postgresql://phase72_qa:${encodeURIComponent(cfg.postgresPassword)}@127.0.0.1:55454/${db}`;
 run(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',path.join(root,'prisma/schema.prisma')],{DATABASE_URL:url},dir);
 const dist=path.join(dir,'dist');run(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.build.json'),'--outDir',dist,'--incremental','false']);
 manifest={id,dir,out,db,dist,createdAt:new Date().toISOString(),maxCalls:2,monthlyCapUsd:10,dailyCapUsd:.50,pilotCapUsd:.40,maxConcurrency:1,maxRegenerations:1,
   selectedPhotos:photos.map(p=>({n:p.n,productId:p.productId,title:p.title,originalSha256:p.originalSha256,sourceHash:p.sourceRequestHash,maskHash:prior.rows.find(r=>r.n===p.n).maskHash})),
   primaryModel:'google/nano-banana-lite/edit',comparisonModelAuthorized:false};
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2),{flag:'wx'});fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 console.log(JSON.stringify({prepared:true,id,dir,out,paidCalls:0}));process.exit(0);
}
if(!['live','offline-tests'].includes(mode))throw Error('Invalid fal pilot mode');
manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(!/^[a-f0-9]{8}$/.test(manifest.id)||manifest.db!=='rezona_phase72_fal_'+manifest.id||
 path.resolve(manifest.dir)!==path.resolve(base,'run-'+manifest.id)||path.resolve(manifest.dist)!==path.resolve(manifest.dir,'dist')||
 fs.existsSync(path.join(manifest.dir,'.env')))throw Error('Unsafe pilot target');
if(mode==='offline-tests'){
 for(const [name,args]of [['unit',[path.join(root,'node_modules/jest/bin/jest.js'),'tests/unit','--runInBand']],
   ['lint',[path.join(root,'node_modules/eslint/bin/eslint.js'),'src/image-enhancement/*.ts','src/ai/recognition-budget.service.ts']]]){
   const r=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,FAL_BRAND_STUDIO_ENABLED:'false',GEMINI_BRAND_STUDIO_ENABLED:'false'},encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:32*1024*1024});
   fs.writeFileSync(path.join(manifest.out,name+'-'+Date.now()+'.log'),(r.stdout??'')+'\n'+(r.stderr??''),{flag:'wx'});
   console.log(JSON.stringify({name,passed:r.status===0,summary:((r.stdout??'')+'\n'+(r.stderr??'')).trim().split(/\r?\n/).slice(-6)}));if(r.status!==0)process.exit(1);
 }process.exit(0);
}
// Only backend runtime reads the locally supplied key. Never print the environment or raw errors.
const env=require('dotenv').parse(fs.readFileSync(path.join(base,'backend.env'))),key=env.FAL_KEY?.trim();
if(!key||key.length<20||/\s/.test(key))throw Error('FAL_BACKEND_KEY_NOT_CONFIGURED');
const dburl=`postgresql://phase72_qa:${encodeURIComponent(cfg.postgresPassword)}@127.0.0.1:55454/${manifest.db}`;
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:dburl,REDIS_URL:'redis://127.0.0.1:56394/2',
 MINIO_ENDPOINT:'127.0.0.1',MINIO_PORT:'59054',MINIO_USE_SSL:'false',MINIO_ACCESS_KEY:'phase72-qa',MINIO_SECRET_KEY:cfg.minioPassword,MINIO_BUCKET:'phase72-fal-'+manifest.id,
 JWT_ADMIN_ACCESS_SECRET:randomUUID()+randomUUID(),JWT_CUSTOMER_ACCESS_SECRET:randomUUID()+randomUUID(),PUSH_PROVIDER:'disabled',
 API_PREFIX:'api',PUBLIC_BASE_URL:'http://127.0.0.1:18499',THROTTLE_LIMIT:'20000',INVENTORY_MANAGEMENT_ENABLED:'true',RAPID_PRODUCT_INTAKE_ENABLED:'true',
 IMAGE_OPTIMIZATION_ENABLED:'true',IMAGE_ENHANCEMENT_ENABLED:'true',IMAGE_ENHANCEMENT_LOCAL_ENABLED:'true',IMAGE_LOCAL_MATTING_ENABLED:'true',
 IMAGE_NEURAL_SEGMENTATION_ENABLED:'true',IMAGE_SEGMENTATION_MODEL:'u2net',IMAGE_SEGMENTATION_MODEL_DIRECTORY:'D:/rezona-phase7-1-qa/models',IMAGE_SEGMENTATION_RUNTIME_DIRECTORY:'D:/rezona-phase7-1-qa/runtime',
 AI_RECOGNITION_ENABLED:'false',AI_LIVE_CALLS_APPROVED:'false',IMAGE_AI_ENABLED:'false',IMAGE_AI_PROVIDER:'mock',
 AI_MONTHLY_BUDGET_USD:'10',AI_DAILY_BUDGET_USD:'0.50',IMAGE_AI_MONTHLY_BUDGET_USD:'10',IMAGE_AI_DAILY_BUDGET_USD:'0.50',IMAGE_AI_CONCURRENCY:'1',
 GEMINI_BRAND_STUDIO_ENABLED:'true',GEMINI_BRAND_STUDIO_PROVIDER:'fal',GEMINI_BRAND_STUDIO_LIVE_APPROVED:'false',
 FAL_BRAND_STUDIO_ENABLED:'true',FAL_BRAND_STUDIO_LIVE_APPROVED:'true',FAL_BRAND_STUDIO_PRIVATE_TRANSFER_APPROVED:'true',FAL_BRAND_STUDIO_TERMS_REVIEWED:'true',
 FAL_BRAND_STUDIO_REVIEWED_AT:new Date().toISOString(),FAL_BRAND_STUDIO_MODEL_REVISION:'fal-nano-lite-reviewed-20261122',
 FAL_BRAND_STUDIO_MONTHLY_BUDGET_USD:'10',FAL_BRAND_STUDIO_DAILY_BUDGET_USD:'0.50',FAL_BRAND_STUDIO_PILOT_BUDGET_USD:'0.40',FAL_BRAND_STUDIO_MAX_CONCURRENCY:'1',
 FAL_BRAND_STUDIO_MAX_REGENERATIONS:'1',FAL_BRAND_STUDIO_INPUTS_JSON:JSON.stringify(manifest.selectedPhotos.map(p=>({sourceHash:p.sourceHash,maskHash:p.maskHash}))),FAL_KEY:key});
delete process.env.GEMINI_API_KEY;delete process.env.GOOGLE_API_KEY;
process.env.NODE_PATH=manifest.dist+path.delimiter+path.join(root,'node_modules');require('node:module').Module._initPaths();process.chdir(manifest.dir);
require('reflect-metadata');
const {CATALOG_STUDIO_V1,studioHash}=require(path.join(manifest.dist,'src/image-enhancement/brand-studio.config'));
process.env.FAL_BRAND_STUDIO_PILOT_STYLE_HASH=studioHash(JSON.stringify(CATALOG_STUDIO_V1));
const originalFetch=global.fetch;let activeSource,networkCalls=0;
const attempts=path.join(base,'authorized-initial-attempts');fs.mkdirSync(attempts,{recursive:true});
global.fetch=async(url,options)=>{
 const u=new URL(String(url)),method=options?.method??'GET';
 if(u.origin==='http://127.0.0.1:18499')return originalFetch(url,options);
 if(u.origin==='https://api.fal.ai'&&method==='GET'&&u.pathname==='/v1/models/pricing')return originalFetch(url,options);
 if(u.href==='https://fal.run/google/nano-banana-lite/edit'&&method==='POST'&&manifest.selectedPhotos.some(p=>p.sourceHash===activeSource)&&networkCalls<2){
   // Durable no-repeat fence survives process crashes and even creation of another scratch DB.
   fs.writeFileSync(path.join(attempts,activeSource+'.json'),JSON.stringify({sourceHash:activeSource,model:manifest.primaryModel,authorizedAt:new Date().toISOString(),pilotId:manifest.id,outcome:'UNKNOWN_UNTIL_RECONCILED'}),{flag:'wx'});
   networkCalls++;return originalFetch(url,options);
 }
 throw Error('FAL_PILOT_NETWORK_SCOPE_DENIED');
};
const write=(name,v)=>fs.writeFileSync(path.join(manifest.dir,name),Buffer.isBuffer(v)?v:JSON.stringify(v,null,2),{flag:'wx'});
(async()=>{
 // Read-only pricing query, no image sent. Pricing permission is optional for inference keys.
 const priceResponse=await fetch('https://api.fal.ai/v1/models/pricing?endpoint_id='+encodeURIComponent(manifest.primaryModel),{headers:{authorization:'Key '+key},signal:AbortSignal.timeout(15000)});
 let priceQuote={httpStatus:priceResponse.status,basis:'PUBLIC_MODEL_DOCUMENTATION',unit:'units',unitPriceUsd:1,currency:'USD'};
 if(priceResponse.status===401)throw Error('FAL_KEY_AUTHENTICATION_FAILED');
 if(priceResponse.ok){const prices=await priceResponse.json(),q=prices.prices?.find(p=>p.endpoint_id===manifest.primaryModel);
   if(!q||q.currency!=='USD'||!['unit','units'].includes(q.unit)||Number(q.unit_price)!==1)throw Error('FAL_PRICING_CHANGED_REVIEW_REQUIRED');
   priceQuote={httpStatus:200,basis:'AUTHENTICATED_FAL_PRICING_API',unit:q.unit,unitPriceUsd:q.unit_price,currency:q.currency};
 }else await priceResponse.body?.cancel();
 process.env.FAL_BRAND_STUDIO_QUOTED_UNIT_PRICE_USD=String(priceQuote.unitPriceUsd);write('price-quote-'+Date.now()+'.json',priceQuote);
 const {NestFactory}=require('@nestjs/core'),{ValidationPipe}=require('@nestjs/common'),{AppModule}=require(path.join(manifest.dist,'src/app.module'));
 const app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
 app.useGlobalFilters(new (require(path.join(manifest.dist,'src/common/filters/http-exception.filter')).HttpExceptionFilter)());
 app.useGlobalInterceptors(new (require(path.join(manifest.dist,'src/common/interceptors/response-envelope.interceptor')).ResponseEnvelopeInterceptor)());
 await app.listen(18499,'127.0.0.1');
 const {PrismaService}=require(path.join(manifest.dist,'src/prisma/prisma.service')),db=app.get(PrismaService);
 const {ImageEditingProvider}=require(path.join(manifest.dist,'src/image-enhancement/enhancement.provider')),provider=app.get(ImageEditingProvider),originalStudio=provider.studio.bind(provider);
 const storage=app.get(require(path.join(manifest.dist,'src/files/storage-provider.interface')).STORAGE_PROVIDER);
 const {isolatedEnhancement}=require(path.join(manifest.dist,'src/image-enhancement/enhancement-isolate'));
 const sharp=require('sharp');let current,rows=[];
 provider.studio=async(png,sourceHash)=>{
   activeSource=sourceHash;current.requestTimestamp=new Date().toISOString();write(current.prefix+'-fal-input.png',png);
   const out=await originalStudio(png,sourceHash);current.providerLatencyMs=out.latencyMs;current.requestId=out.requestId??null;current.billing=out.billing;
   const m=await sharp(out.bytes).metadata();current.providerDimensions={width:m.width,height:m.height};write(current.prefix+'-fal-output.png',out.bytes);return out;
 };
 try{
  const email='fal-pilot-'+randomUUID()+'@example.test',password=randomUUID()+':Aa9!',owner=await db.adminUser.create({data:{email,normalizedEmail:email,name:'Isolated fal pilot operator',role:'OWNER',isOwner:true,
    passwordHash:await app.get(require(path.join(manifest.dist,'src/common/security/password.service')).PasswordService).hash(password)}});
  write('private-qa-admin.json',{email,password});
  const login=await fetch('http://127.0.0.1:18499/api/admin/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
  const auth=await login.json();if(!login.ok||!auth.data?.accessToken)throw Error('FAL_QA_NORMAL_LOGIN_FAILED');
  const token=auth.data.accessToken;
  async function api(method,url,body,key0){if(!url.startsWith('/admin/product-intake/sessions')||/\/submit$/.test(url))throw Error('FAL_QA_INTAKE_SCOPE_DENIED');
   const form=body instanceof FormData,r=await fetch('http://127.0.0.1:18499/api'+url,{method,headers:{authorization:'Bearer '+token,'X-Intake-Actor':owner.id,...(!form?{'content-type':'application/json'}:{}),...(key0?{'Idempotency-Key':key0}:{})},body:body===undefined?undefined:form?body:JSON.stringify(body)});
   const b=await r.json();if(!r.ok)throw Error('FAL_QA_HTTP_'+r.status);return b.data;
  }
  async function object(assetId){const a=await db.fileAsset.findUniqueOrThrow({where:{id:assetId}});assert.equal(a.intakePrivate,true);assert.equal(a.intakeProductId,null);const r=await storage.getObject(a.key),chunks=[];for await(const b of r.stream)chunks.push(b);return Buffer.concat(chunks);}
  async function wait(s,id){const end=Date.now()+120000;while(Date.now()<end){const st=await api('GET','/admin/product-intake/sessions/'+s.id+'/enhancements'),j=st.jobs.find(x=>x.id===id);if(j&&['COMPLETED','FAILED','UNKNOWN','CANCELLED'].includes(j.status))return j;await new Promise(r=>setTimeout(r,250));}throw Error('FAL_QA_JOB_WAIT_TIMEOUT');}
  const sessionBase='/admin/product-intake/sessions';
  for(const photo of photos){
   const item=manifest.selectedPhotos.find(p=>p.n===photo.n),bytes=fs.readFileSync(photo.originalPath);assert.equal(hash(bytes),photo.originalSha256);
   current={n:photo.n,productId:photo.productId,title:photo.title,sourceHash:item.sourceHash,maskHash:item.maskHash,prefix:String(photo.n).padStart(2,'0'),
     model:manifest.primaryModel,employeeReview:'PENDING_NOT_SELECTED_FOR_PRODUCT',actualCostUsd:null};write(current.prefix+'-original.jpeg',bytes);
   let s=await api('POST',sessionBase,{clientDraftId:randomUUID(),submissionOperationKey:randomUUID()});
   s=await api('PATCH',sessionBase+'/'+s.id,{expectedRevision:s.revision,selectedImageKey:randomUUID()});
   const form=new FormData();form.set('clientImageId',s.selectedImageKey);form.set('file',new Blob([bytes],{type:'image/jpeg'}),'private-product.jpeg');s=await api('POST',sessionBase+'/'+s.id+'/image',form);current.sessionId=s.id;
   const ep=sessionBase+'/'+s.id+'/enhancements';
   const source=await api('POST',ep,{clientImageId:s.selectedImageKey,requestKey:randomUUID(),mode:'NEURAL_BACKGROUND_REMOVE'}),local=await wait(s,source.jobs[0].id);
   assert.equal(local.status,'COMPLETED');assert.equal(local.candidate.contentHash,photo.approvedMedia.contentHash);assert.equal(local.candidate.processingDetails.maskHash,item.maskHash);
   const localRow=await db.productImageEnhancementCandidate.findUniqueOrThrow({where:{id:local.candidate.id}}),maskBytes=await object(localRow.maskAssetId),localBytes=await object(localRow.assetId);
   write(current.prefix+'-mask.png',maskBytes);write(current.prefix+'-local.webp',localBytes);
   const prepared=await isolatedEnhancement({bytes,mime:'image/jpeg',mode:'GEMINI_BRAND_STUDIO',mask:maskBytes,studioProfile:CATALOG_STUDIO_V1,background:'WHITE',matting:false});
   current.expectedForegroundHash=prepared.details.foregroundHash;
   await api('POST',ep+'/decision',{clientImageId:s.selectedImageKey,requestKey:randomUUID(),expectedRevision:s.revision,expectedMediaRevision:0,action:'ACCEPT',candidateId:local.candidate.id,reviewed:true});
   const requestKey=randomUUID();current.requestKey=requestKey;write(current.prefix+'-before-dispatch.json',current);
   const q=await api('POST',ep,{clientImageId:s.selectedImageKey,requestKey,mode:'GEMINI_BRAND_STUDIO',sourceCandidateId:local.candidate.id,maskReviewed:true,privateTransferApproved:true}),job=await wait(s,q.jobs[0].id);
   current.jobId=job.id;current.jobStatus=job.status;current.errorCode=job.errorCode;current.technicalOutcome=job.status==='COMPLETED'?'PASSED_BACKGROUND_AND_PIXEL_GATE_REQUIRES_HUMAN_REVIEW':'REJECTED_KEEP_LOCAL';
   let finalBytes=localBytes;
   if(job.candidate){const cr=await db.productImageEnhancementCandidate.findUniqueOrThrow({where:{id:job.candidate.id}});finalBytes=await object(cr.assetId);write(current.prefix+'-composited.png',finalBytes);
     assert.equal(job.candidate.processingDetails.foregroundHash,current.expectedForegroundHash);current.candidateId=cr.id;current.foregroundPreserved=true;
   }
   let usage;const settleEnd=Date.now()+15000;do{usage=await db.recognitionUsage.findFirst({where:{enhancementJobId:job.id}});
     if(usage&&usage.status!=='RESERVED')break;await new Promise(r=>setTimeout(r,100));}while(Date.now()<settleEnd);
   current.ledger={status:usage?.status,reservedUsd:usage?.reservedUsd.toString(),estimatedUsd:usage?.estimatedUsd?.toString()??null,actualBilledUsd:null};
   const snapshot=await db.productIntakeSession.findUniqueOrThrow({where:{id:s.id}});assert.equal(snapshot.status,'DRAFT');assert.equal(snapshot.completedProductId,null);assert.equal(snapshot.quantity,null);assert.equal(snapshot.locationId,null);
   current.finalImageSelected=false;current.sourceSelectionOnly=true;rows.push(current);write(current.prefix+'-result.json',current);
   const label=t=>Buffer.from(`<svg width="600" height="70"><rect width="600" height="70" fill="#151919"/><text x="20" y="42" font-family="Arial" font-size="20" fill="#E7BC61">${t}</text></svg>`);
   const panel=async b=>sharp(b).resize(580,580,{fit:'contain',background:'#F8F6F1'}).jpeg().toBuffer();
   const rawFile=path.join(manifest.dir,current.prefix+'-fal-output.png'),raw=fs.existsSync(rawFile)?fs.readFileSync(rawFile):Buffer.from('<svg width="580" height="580"><text x="20" y="200">NO VALID PROVIDER OUTPUT</text></svg>');
   const board=await sharp({create:{width:2400,height:750,channels:3,background:'#0C0F0F'}}).composite([
     {input:label('A. Original (unchanged)'),left:0,top:0},{input:label('B. Approved local isolation'),left:600,top:0},
     {input:label('C. RAW FAL OUTPUT - NOT APPROVED'),left:1200,top:0},{input:label(job.candidate?'D. Recomposition - employee review pending':'D. REJECTED - KEEPING LOCAL IMAGE'),left:1800,top:0},
     {input:await panel(bytes),left:10,top:90},{input:await panel(localBytes),left:610,top:90},{input:await panel(raw),left:1210,top:90},{input:await panel(finalBytes),left:1810,top:90},
     {input:Buffer.from('<svg width="2400" height="60"><text x="20" y="35" font-family="Arial" font-size="20" fill="white">PRIVATE REAL FAL PILOT / No automatic publishing or product image selection</text></svg>'),left:0,top:690}]).jpeg({quality:92}).toBuffer();write(current.prefix+'-comparison.jpg',board);
   console.log(JSON.stringify({photo:photo.n,model:current.model,status:current.technicalOutcome,billing:current.billing??null}));
   if(job.status!=='COMPLETED')break; // Stop at first rejected/ambiguous result, never regenerate.
  }
  const report={time:new Date().toISOString(),scope:'Isolated fal-only QA. No product submission, stock or automatic publishing.',pilot:manifest,priceQuote,
    realInferenceCalls:networkCalls,rows,skipped:photos.filter(p=>!rows.some(r=>r.n===p.n)).map(p=>({n:p.n,reason:'Stopped after first rejected/uncertain output'})),
    problematicFour:'NOT_PROCESSED',comparisonModelCalls:0,totalActualUsd:null,totalEstimatedUsd:rows.every(r=>r.billing?.estimatedChargedUsd!=null)?rows.reduce((v,r)=>v+Number(r.billing.estimatedChargedUsd),0):null};
  write('pilot-result.json',report);fs.writeFileSync(path.join(manifest.out,'pilot-result.json'),JSON.stringify(report,null,2),{flag:'wx'});
  fs.writeFileSync(path.join(manifest.dir,'review.html'),'<!doctype html><meta charset="utf-8"><title>Private fal pilot</title><body style="background:#0C0F0F;color:white;font-family:Arial"><h1>Private real fal pilot - employee review pending</h1>'+rows.map(r=>`<h2>${r.title}</h2><p>${r.technicalOutcome}</p><img style="width:100%" src="${r.prefix}-comparison.jpg">`).join(''),{flag:'wx'});
  console.log(JSON.stringify({complete:true,pilotId:manifest.id,realCalls:networkCalls,report:path.join(manifest.dir,'pilot-result.json'),totalEstimatedUsd:report.totalEstimatedUsd,actualInvoice:'NOT_RECONCILED'}));
 }finally{provider.studio=originalStudio;await app.close();}
})().catch(e=>{
 const code=/^[A-Z0-9_]{1,100}$/.test(e?.message??'')?e.message:'FAL_PILOT_STOPPED_FOR_REVIEW';
 fs.writeFileSync(path.join(manifest.out,'stopped-'+Date.now()+'.json'),JSON.stringify({code,realInferenceCalls:networkCalls,source:activeSource??null,automaticRetry:false}),{flag:'wx'});
 console.error(code);process.exitCode=1;
});
