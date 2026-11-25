// Six OWNER-APPROVED distinct source/style requests only. Never a generic batch/retry tool.
if (process.env.REZONA_TABLETOP_PILOT !== '1') throw Error('Explicit tabletop pilot opt-in required');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{createHash,randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),base='D:/rezona-phase7-3-qa',manifestPath=path.join(base,'pilot-manifest.json'),mode=process.argv[2];
// Phase7.3.1 supersedes the prior paid/continuation authorization. Preserve all fences.
if(['live','continue-approved'].includes(mode))throw Error('PHASE731_PAID_REQUESTS_SUSPENDED');
const hash=b=>createHash('sha256').update(b).digest('hex');
const original=JSON.parse(fs.readFileSync('D:/rezona-phase7-1-qa/real-products-20261121/intake-journal.json','utf8'));
const old=JSON.parse(fs.readFileSync('D:/rezona-phase7-2-qa/fal-pilot/pilot-manifest.json','utf8'));
const cfg=JSON.parse(fs.readFileSync('D:/rezona-phase7-2-qa/20261122-6470081b/runtime-secrets.json','utf8'));
const photos=original.products.filter(p=>[1,5].includes(p.n));assert.equal(photos.length,2);
const command=(exe,args,env={},cwd=root)=>{
 const r=spawnSync(exe,args,{cwd,env:{...process.env,...env},encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:32*1024*1024});
 if(r.status!==0)throw Error('TABLETOP_LOCAL_COMMAND_FAILED');return r.stdout;
};
if(mode==='prepare'){
 if(fs.existsSync(manifestPath))throw Error('Do not recreate an existing approved pilot');fs.mkdirSync(base,{recursive:true});
 const id=randomUUID().slice(0,8),dir=path.join(base,'run-'+id),out=path.join(root,'docs/benchmarks/phase7-3',id),db='rezona_phase73_fal_'+id;
 if(fs.existsSync(dir)||fs.existsSync(out))throw Error('No-overwrite destination');fs.mkdirSync(dir);fs.mkdirSync(out,{recursive:true});
 command('docker',['exec','rezona-phase72-qa-postgres','createdb','-U','phase72_qa',db]);
 const url=`postgresql://phase72_qa:${encodeURIComponent(cfg.postgresPassword)}@127.0.0.1:55454/${db}`;
 command(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',path.join(root,'prisma/schema.prisma')],{DATABASE_URL:url},dir);
 const dist=path.join(dir,'dist');command(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.build.json'),'--outDir',dist,'--incremental','false']);
 process.env.NODE_PATH=dist+path.delimiter+path.join(root,'node_modules');require('node:module').Module._initPaths();
 const {TABLETOP_STYLES,studioHash}=require(path.join(dist,'src/image-enhancement/brand-studio.config.js'));
 const m={id,dir,out,db,dist,createdAt:new Date().toISOString(),approvalId:'REZONA_TABLETOP_SIX_20261122',maxCalls:6,maxConcurrency:1,maxRegenerations:0,pilotCapUsd:'1.10',dailyCapUsd:'1.50',monthlyCapUsd:'10',priorCommitmentUsd:'0.348160',
  primaryModel:'google/nano-banana-lite/edit',comparisonModelAuthorized:false,
  photos:photos.map(p=>({...old.selectedPhotos.find(s=>s.n===p.n),title:p.title})),
  styles:TABLETOP_STYLES.map(s=>({id:s.profile.name,label:s.label,hash:studioHash(JSON.stringify(s.profile)),promptVersion:s.profile.promptVersion}))};
 for(const p of [manifestPath,path.join(out,'manifest.json')])fs.writeFileSync(p,JSON.stringify(m,null,2),{flag:'wx'});
 console.log(JSON.stringify({prepared:true,id,dir,out,paidRequests:0}));process.exit(0);
}
if(!['live','checks','continue-approved'].includes(mode))throw Error('Invalid mode');
const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
assert.match(m.id,/^[a-f0-9]{8}$/);assert.equal(m.db,'rezona_phase73_fal_'+m.id);assert.equal(path.resolve(m.dir),path.resolve(base,'run-'+m.id));assert.equal(m.maxCalls,6);
if(mode==='checks'){
 const jobs=[['unit',['node_modules/jest/bin/jest.js','tests/unit','--runInBand']],['lint',['node_modules/eslint/bin/eslint.js','src/image-enhancement/*.ts','src/ai/recognition-budget.service.ts','src/product-intake/intake-enhancement.controller.ts','tests/unit/tabletop-styles.spec.ts']],
 ['typecheck',['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']]];
 for(const[name,args]of jobs){const r=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,FAL_BRAND_STUDIO_ENABLED:'false',FAL_TABLETOP_STYLES_ENABLED:'false'},encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:32*1024*1024});
 const log=(r.stdout??'')+'\n'+(r.stderr??'');fs.writeFileSync(path.join(m.out,name+'-'+Date.now()+'.log'),log,{flag:'wx'});console.log(JSON.stringify({name,passed:r.status===0,summary:log.trim().split(/\r?\n/).slice(-6)}));if(r.status!==0)process.exit(1);}process.exit(0);
}
const continuation=mode==='continue-approved';
if(continuation&&process.env.REZONA_TABLETOP_REMAINING_APPROVED!=='REZONA_TABLETOP_REMAINING_THREE_20261122')throw Error('Explicit new owner approval for the three unattempted pairs required');
const priorResult=continuation?JSON.parse(fs.readFileSync(path.join(m.dir,'pilot-result.json'),'utf8')):null;
const resultName=continuation?'pilot-result-continuation.json':'pilot-result.json';
if(continuation){assert.equal(priorResult.realRequests,3);assert.equal(priorResult.stoppedAfterUnknown,true);}
if(fs.existsSync(path.join(m.dir,resultName)))throw Error('Pilot already completed; no automatic rerun');
const alreadyAttempted=new Set((priorResult?.rows??[]).map(r=>r.preset+':'+r.n));
const key=require('dotenv').parse(fs.readFileSync('D:/rezona-phase7-2-qa/fal-pilot/backend.env')).FAL_KEY?.trim();
if(!key)throw Error('FAL_BACKEND_KEY_MISSING');
process.env.NODE_PATH=m.dist+path.delimiter+path.join(root,'node_modules');require('node:module').Module._initPaths();
const{TABLETOP_STYLES,studioHash,CATALOG_STUDIO_V1}=require(path.join(m.dist,'src/image-enhancement/brand-studio.config.js'));
for(const s of m.styles)assert.equal(studioHash(JSON.stringify(TABLETOP_STYLES.find(t=>t.profile.name===s.id).profile)),s.hash);
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:`postgresql://phase72_qa:${encodeURIComponent(cfg.postgresPassword)}@127.0.0.1:55454/${m.db}`,REDIS_URL:'redis://127.0.0.1:56394/3',
 MINIO_ENDPOINT:'127.0.0.1',MINIO_PORT:'59054',MINIO_USE_SSL:'false',MINIO_ACCESS_KEY:'phase72-qa',MINIO_SECRET_KEY:cfg.minioPassword,MINIO_BUCKET:'phase73-'+m.id,
 JWT_ADMIN_ACCESS_SECRET:randomUUID()+randomUUID(),JWT_CUSTOMER_ACCESS_SECRET:randomUUID()+randomUUID(),PUSH_PROVIDER:'disabled',PUBLIC_BASE_URL:'http://127.0.0.1:18503',API_PREFIX:'api',THROTTLE_LIMIT:'20000',
 INVENTORY_MANAGEMENT_ENABLED:'true',RAPID_PRODUCT_INTAKE_ENABLED:'true',IMAGE_OPTIMIZATION_ENABLED:'true',IMAGE_ENHANCEMENT_ENABLED:'true',IMAGE_ENHANCEMENT_LOCAL_ENABLED:'true',IMAGE_LOCAL_MATTING_ENABLED:'true',
 IMAGE_NEURAL_SEGMENTATION_ENABLED:'true',IMAGE_SEGMENTATION_MODEL:'u2net',IMAGE_SEGMENTATION_MODEL_DIRECTORY:'D:/rezona-phase7-1-qa/models',IMAGE_SEGMENTATION_RUNTIME_DIRECTORY:'D:/rezona-phase7-1-qa/runtime',
 AI_RECOGNITION_ENABLED:'false',AI_LIVE_CALLS_APPROVED:'false',IMAGE_AI_ENABLED:'false',IMAGE_AI_PROVIDER:'mock',AI_MONTHLY_BUDGET_USD:'10',AI_DAILY_BUDGET_USD:'1.50',IMAGE_AI_MONTHLY_BUDGET_USD:'10',IMAGE_AI_DAILY_BUDGET_USD:'1.50',IMAGE_AI_CONCURRENCY:'1',IMAGE_AI_DAILY_LIMIT:'6',IMAGE_AI_EMPLOYEE_DAILY_LIMIT:'6',IMAGE_AI_EMPLOYEE_HOURLY_LIMIT:'6',
 GEMINI_BRAND_STUDIO_ENABLED:'true',GEMINI_BRAND_STUDIO_PROVIDER:'fal',GEMINI_BRAND_STUDIO_LIVE_APPROVED:'false',FAL_BRAND_STUDIO_ENABLED:'true',FAL_BRAND_STUDIO_LIVE_APPROVED:'true',
 FAL_BRAND_STUDIO_PRIVATE_TRANSFER_APPROVED:'true',FAL_BRAND_STUDIO_TERMS_REVIEWED:'true',FAL_BRAND_STUDIO_REVIEWED_AT:new Date().toISOString(),FAL_BRAND_STUDIO_MODEL_REVISION:'fal-nano-lite-tabletop-reviewed-20261122',
 FAL_BRAND_STUDIO_MONTHLY_BUDGET_USD:'10',FAL_BRAND_STUDIO_DAILY_BUDGET_USD:'1.50',FAL_BRAND_STUDIO_PILOT_BUDGET_USD:'1.10',FAL_BRAND_STUDIO_MAX_CONCURRENCY:'1',FAL_BRAND_STUDIO_MAX_REGENERATIONS:'0',
 FAL_BRAND_STUDIO_INPUTS_JSON:JSON.stringify(m.photos.map(p=>({sourceHash:p.sourceHash,maskHash:p.maskHash}))),FAL_TABLETOP_STYLES_ENABLED:'true',FAL_TABLETOP_PILOT_APPROVED:'true',
 FAL_TABLETOP_APPROVAL_ID:m.approvalId,FAL_TABLETOP_PRIOR_COMMITMENT_USD:'0.348160',FAL_TABLETOP_APPROVED_STYLE_HASHES:JSON.stringify(m.styles.map(s=>s.hash)),FAL_KEY:key});
delete process.env.GEMINI_API_KEY;delete process.env.GOOGLE_API_KEY;
process.chdir(m.dir);require('reflect-metadata');
const nativeFetch=global.fetch;let current,callCount=priorResult?.realRequests??0,inflight=0,maxInflight=priorResult?.maxObservedConcurrency??0;
const attempts=path.join(base,'authorized-style-attempts');fs.mkdirSync(attempts,{recursive:true});
global.fetch=async(url,options)=>{
 const u=new URL(String(url)),method=options?.method??'GET';
 if(u.origin==='http://127.0.0.1:18503')return nativeFetch(url,options);
 if(u.origin==='https://api.fal.ai'&&u.pathname==='/v1/models/pricing'&&method==='GET')return nativeFetch(url,options);
 if(u.href==='https://fal.run/'+m.primaryModel&&method==='POST'&&current&&callCount<6&&inflight===0&&m.photos.some(p=>p.sourceHash===current.sourceHash)&&m.styles.some(s=>s.hash===current.styleHash)){
   fs.writeFileSync(path.join(attempts,m.approvalId+'-'+current.sourceHash+'-'+current.styleHash+'.json'),JSON.stringify({approvalId:m.approvalId,sourceHash:current.sourceHash,styleHash:current.styleHash,dispatchedAt:new Date().toISOString(),outcome:'UNKNOWN_UNTIL_RECONCILED'}),{flag:'wx'});
   callCount++;inflight++;maxInflight=Math.max(maxInflight,inflight);try{return await nativeFetch(url,options);}finally{inflight--;}
 }throw Error('TABLETOP_NETWORK_SCOPE_DENIED');
};
const write=(name,v)=>fs.writeFileSync(path.join(m.dir,name),Buffer.isBuffer(v)?v:JSON.stringify(v,null,2),{flag:'wx'});
(async()=>{
 const{PrismaClient}=require('@prisma/client');
 const priorDb=new PrismaClient({datasources:{db:{url:`postgresql://phase72_qa:${encodeURIComponent(cfg.postgresPassword)}@127.0.0.1:55454/${old.db}`}},log:[]});
 try{await priorDb.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const sum=await tx.recognitionUsage.aggregate({_sum:{committedUsd:true}});assert.equal(sum._sum.committedUsd.toString(),'0.34816');});}finally{await priorDb.$disconnect();}
 const price=await fetch('https://api.fal.ai/v1/models/pricing?endpoint_id='+encodeURIComponent(m.primaryModel),{headers:{authorization:'Key '+key},signal:AbortSignal.timeout(15000)});
 if(!price.ok){await price.body?.cancel();throw Error('TABLETOP_PRICE_VERIFICATION_FAILED');}
 const quote=(await price.json()).prices?.find(p=>p.endpoint_id===m.primaryModel);assert.equal(quote?.currency,'USD');assert.equal(Number(quote?.unit_price),1);assert.ok(['units','unit'].includes(quote.unit));
 process.env.FAL_BRAND_STUDIO_QUOTED_UNIT_PRICE_USD='1';write(continuation?'price-quote-continuation.json':'price-quote.json',{currency:'USD',unitPrice:1,unit:quote.unit});
 const{NestFactory}=require('@nestjs/core'),{ValidationPipe}=require('@nestjs/common'),{AppModule}=require(path.join(m.dist,'src/app.module.js'));
 const app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
 app.useGlobalFilters(new(require(path.join(m.dist,'src/common/filters/http-exception.filter.js')).HttpExceptionFilter)());app.useGlobalInterceptors(new(require(path.join(m.dist,'src/common/interceptors/response-envelope.interceptor.js')).ResponseEnvelopeInterceptor)());
 await app.listen(18503,'127.0.0.1');
 const db=app.get(require(path.join(m.dist,'src/prisma/prisma.service.js')).PrismaService),provider=app.get(require(path.join(m.dist,'src/image-enhancement/enhancement.provider.js')).ImageEditingProvider),originalStudio=provider.studio.bind(provider);
 const storage=app.get(require(path.join(m.dist,'src/files/storage-provider.interface.js')).STORAGE_PROVIDER),sharp=require('sharp'),{isolatedEnhancement}=require(path.join(m.dist,'src/image-enhancement/enhancement-isolate.js'));
 provider.studio=async(png,sourceHash,preset)=>{
   assert.equal(current.sourceHash,sourceHash);assert.equal(current.preset,preset);current.requestTimestamp=new Date().toISOString();write(current.prefix+'-provider-input.png',png);
   try{const r=await originalStudio(png,sourceHash,preset);current.requestId=r.requestId??null;current.billing=r.billing;current.providerLatencyMs=r.latencyMs;current.outputDimensions={width:1024,height:1024};write(current.prefix+'-raw-fal.png',r.bytes);return r;}
   catch(e){if(e?.diagnostics){current.providerDiagnostics=e.diagnostics;current.requestId=e.diagnostics.requestId;current.providerLatencyMs=e.diagnostics.latencyMs;}throw e;}
 };
 const rows=[...(priorResult?.rows??[])];
 try{
  const email='tabletop-'+randomUUID()+'@example.test',password=randomUUID()+':Aa9!',owner=await db.adminUser.create({data:{email,normalizedEmail:email,name:'Private tabletop QA reviewer',role:'OWNER',isOwner:true,passwordHash:await app.get(require(path.join(m.dist,'src/common/security/password.service.js')).PasswordService).hash(password)}});
  write(continuation?'private-admin-continuation.json':'private-admin.json',{email,password});const login=await fetch('http://127.0.0.1:18503/api/admin/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});const auth=await login.json();assert.ok(login.ok&&auth.data?.accessToken);const token=auth.data.accessToken;
  async function api(method,url,body){assert.ok(url.startsWith('/admin/product-intake/sessions')&&!/\/submit$/.test(url));const form=body instanceof FormData,r=await fetch('http://127.0.0.1:18503/api'+url,{method,headers:{authorization:'Bearer '+token,'X-Intake-Actor':owner.id,...(!form?{'content-type':'application/json'}:{})},body:body===undefined?undefined:form?body:JSON.stringify(body)});const b=await r.json();if(!r.ok)throw Error('TABLETOP_QA_HTTP_'+r.status);return b.data;}
  async function object(id){const a=await db.fileAsset.findUniqueOrThrow({where:{id}});assert.equal(a.intakePrivate,true);assert.equal(a.intakeProductId,null);const r=await storage.getObject(a.key),chunks=[];for await(const b of r.stream)chunks.push(b);return Buffer.concat(chunks);}
  async function wait(s,id){const end=Date.now()+120000;while(Date.now()<end){const state=await api('GET','/admin/product-intake/sessions/'+s.id+'/enhancements'),j=state.jobs.find(j=>j.id===id);if(j&&['COMPLETED','FAILED','UNKNOWN','CANCELLED'].includes(j.status))return j;await new Promise(r=>setTimeout(r,250));}throw Error('TABLETOP_JOB_WAIT_TIMEOUT');}
  let stopped=false;
  for(const style of m.styles){for(const p of photos){
   if(stopped)break;if(alreadyAttempted.has(style.id+':'+p.n))continue;
   const item=m.photos.find(x=>x.n===p.n),bytes=fs.readFileSync(p.originalPath);assert.equal(hash(bytes),item.originalSha256);
   current={n:p.n,productId:p.productId,title:p.title,preset:style.id,styleLabel:style.label,styleHash:style.hash,sourceHash:item.sourceHash,maskHash:item.maskHash,prefix:style.id.replace('REZONA_STYLE_','').toLowerCase()+'-'+p.n,model:m.primaryModel,employeeApproval:'PENDING',finalImageSelected:false,actualChargedUsd:null};
   const endpoint='/admin/product-intake/sessions';let s=await api('POST',endpoint,{clientDraftId:randomUUID(),submissionOperationKey:randomUUID()});s=await api('PATCH',endpoint+'/'+s.id,{expectedRevision:s.revision,selectedImageKey:randomUUID()});
   const form=new FormData();form.set('clientImageId',s.selectedImageKey);form.set('file',new Blob([bytes],{type:'image/jpeg'}),'private-product.jpeg');s=await api('POST',endpoint+'/'+s.id+'/image',form);current.sessionId=s.id;const ep=endpoint+'/'+s.id+'/enhancements';
   const source=await api('POST',ep,{clientImageId:s.selectedImageKey,requestKey:randomUUID(),mode:'NEURAL_BACKGROUND_REMOVE'}),local=await wait(s,source.jobs[0].id);assert.equal(local.status,'COMPLETED');assert.equal(local.candidate.contentHash,p.approvedMedia.contentHash);assert.equal(local.candidate.processingDetails.maskHash,item.maskHash);
   const localRow=await db.productImageEnhancementCandidate.findUniqueOrThrow({where:{id:local.candidate.id}}),mask=await object(localRow.maskAssetId);
   const neutral=await isolatedEnhancement({bytes,mime:'image/jpeg',mask,mode:'GEMINI_BRAND_STUDIO',background:'WHITE',matting:false,studioProfile:CATALOG_STUDIO_V1});current.foregroundHash=neutral.details.foregroundHash;write(current.prefix+'-local-neutral.png',neutral.png);write(current.prefix+'-mask.png',mask);write(current.prefix+'-original.jpeg',bytes);
   await api('POST',ep+'/decision',{clientImageId:s.selectedImageKey,requestKey:randomUUID(),expectedRevision:s.revision,expectedMediaRevision:0,action:'ACCEPT',candidateId:local.candidate.id,reviewed:true});
   write(current.prefix+'-before-dispatch.json',current);
   const requestKey=randomUUID(),q=await api('POST',ep,{clientImageId:s.selectedImageKey,requestKey,mode:'GEMINI_BRAND_STUDIO',sourceCandidateId:local.candidate.id,maskReviewed:true,privateTransferApproved:true,stylePreset:style.id}),j=await wait(s,q.jobs[0].id);
   current.jobId=j.id;current.jobStatus=j.status;current.errorCode=j.errorCode;let final=neutral.png;
   if(j.candidate){const candidate=await db.productImageEnhancementCandidate.findUniqueOrThrow({where:{id:j.candidate.id}});assert.equal(j.candidate.processingDetails.foregroundHash,current.foregroundHash);current.foregroundPreserved=true;current.candidateId=candidate.id;final=await object(candidate.assetId);write(current.prefix+'-final.png',final);
    const status=await api('GET',ep);assert.equal(status.capabilities.localNeutralDefault,true);assert.equal(status.capabilities.studioMaxRegenerations,0);assert.equal(status.capabilities.studioPresets.length,3);
    const denied=await fetch('http://127.0.0.1:18503/api'+ep+'/decision',{method:'POST',headers:{authorization:'Bearer '+token,'X-Intake-Actor':owner.id,'content-type':'application/json'},body:JSON.stringify({clientImageId:s.selectedImageKey,requestKey:randomUUID(),expectedRevision:status.businessRevision,expectedMediaRevision:status.mediaRevision,action:'ACCEPT',candidateId:candidate.id,reviewed:true,sceneReviewed:false,meaningfulImprovement:false})});
    assert.equal(denied.status,400);await denied.body?.cancel();current.sceneAndValueApprovalGateVerified=true;
   }
   let usage;const until=Date.now()+15000;do{usage=await db.recognitionUsage.findFirst({where:{enhancementJobId:j.id}});if(usage&&usage.status!=='RESERVED')break;await new Promise(r=>setTimeout(r,100));}while(Date.now()<until);
   current.ledger={status:usage?.status,reservedUsd:usage?.reservedUsd.toString(),committedUsd:usage?.committedUsd.toString(),estimatedUsd:usage?.estimatedUsd?.toString()??null,actualBilledUsd:null};
   const state=await db.productIntakeSession.findUniqueOrThrow({where:{id:s.id}});assert.equal(state.status,'DRAFT');assert.equal(state.completedProductId,null);assert.equal(state.quantity,null);assert.equal(state.locationId,null);
   const rawPath=path.join(m.dir,current.prefix+'-raw-fal.png'),raw=fs.existsSync(rawPath)?fs.readFileSync(rawPath):Buffer.from('<svg width="580" height="580"><rect width="580" height="580" fill="#F8F6F1"/><text x="30" y="250" font-size="26">NO VALID FAL IMAGE</text></svg>');
   const panel=b=>sharp(b).resize(580,580,{fit:'contain',background:'#F8F6F1'}).png().toBuffer();const label=t=>Buffer.from(`<svg width="600" height="70"><rect width="600" height="70" fill="#141919"/><text x="16" y="42" font-family="Arial" font-size="20" fill="#E7BC61">${t}</text></svg>`);
   const board=await sharp({create:{width:2400,height:740,channels:3,background:'#0C0F0F'}}).composite([{input:label('A Original - unchanged'),top:0,left:0},{input:label('B Local neutral - no paid AI'),top:0,left:600},{input:label('C RAW AI environment - not approved'),top:0,left:1200},{input:label(j.candidate?'D SAME real foreground - review pending':'D Rejected/unknown - keeping local'),top:0,left:1800},
    {input:await panel(bytes),top:90,left:10},{input:await panel(neutral.png),top:90,left:610},{input:await panel(raw),top:90,left:1210},{input:await panel(final),top:90,left:1810}]).jpeg({quality:93}).toBuffer();write(current.prefix+'-comparison.jpg',board);
   rows.push(current);write(current.prefix+'-result.json',current);console.log(JSON.stringify({photo:p.n,preset:style.id,status:j.status,error:j.errorCode,estimatedUsd:current.ledger.estimatedUsd}));
   if(j.status==='UNKNOWN')stopped=true; // No further paid work after an ambiguous transport outcome.
  }if(stopped)break;}
  assert.equal(await db.productListing.count(),0);const ledger=await db.recognitionUsage.findMany({select:{status:true,committedUsd:true,estimatedUsd:true,actualBilledUsd:true}});
  const result={completedAt:new Date().toISOString(),manifest:m,realRequests:callCount,maxObservedConcurrency:maxInflight,regenerations:0,rows,ledger,priorReservationUnchanged:'0.348160',totalActualChargedUsd:null,otherFour:'NOT_PROCESSED',employeeApproval:'PENDING',automaticPublishing:false,stoppedAfterUnknown:stopped};
  write(resultName,result);fs.writeFileSync(path.join(m.out,resultName),JSON.stringify(result,null,2),{flag:'wx'});
  const reviewName=continuation?'review-continuation.html':'review.html';
  fs.writeFileSync(path.join(m.dir,reviewName),'<!doctype html><meta charset="utf-8"><title>Private REZONA tabletop pilot</title><body style="background:#101414;color:white;font-family:Arial"><h1>Private tabletop comparison - approval pending</h1>'+rows.map(r=>`<h2>${r.title} / ${r.styleLabel}</h2><p>${r.jobStatus} - never automatically selected</p><img style="width:100%" src="${r.prefix}-comparison.jpg">`).join(''),{flag:'wx'});
  console.log(JSON.stringify({complete:true,requests:callCount,report:path.join(m.out,resultName),privateBoards:path.join(m.dir,reviewName)}));
 }finally{provider.studio=originalStudio;await app.close();}
})().catch(e=>{const code=/^[A-Z0-9_]{1,100}$/.test(e?.message??'')?e.message:'TABLETOP_STOPPED_FOR_REVIEW';fs.writeFileSync(path.join(m.out,'stopped-'+Date.now()+'.json'),JSON.stringify({code,paidRequests:callCount,noAutomaticRetry:true}),{flag:'wx'});console.error(code);process.exitCode=1;});
