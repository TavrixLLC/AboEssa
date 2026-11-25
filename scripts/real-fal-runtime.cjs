// Authenticated existing QA app only. Default is offline checks; paid run requires explicit CLI mode.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),m=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync('D:/rezona-real-fal-qa/current.json','utf8')).manifest,'utf8')),
 prior=JSON.parse(fs.readFileSync(m.priorManifest,'utf8')),sec=JSON.parse(fs.readFileSync(path.join(prior.dir,'runtime-secrets.json'),'utf8')),
 mode=process.argv[2] ?? 'checks',live=mode==='paid',dist=path.join(m.dir,process.env.REAL_FAL_BUILD ?? 'dist-v1'),origin='http://127.0.0.1:18528',sha=b=>createHash('sha256').update(b).digest('hex');
assert.ok(['checks','paid','export','review'].includes(mode));
const write=(n,v)=>fs.writeFileSync(path.join(m.out,n),JSON.stringify(v,null,2),{flag:'wx'});
process.env.NODE_PATH=dist+path.delimiter+path.join(root,'node_modules');require('node:module').Module._initPaths();
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:`postgresql://real_studio_qa:${encodeURIComponent(sec.postgresPassword)}@127.0.0.1:55456/${prior.db}`,REDIS_URL:'redis://127.0.0.1:56396',MINIO_ENDPOINT:'127.0.0.1',MINIO_PORT:'59057',MINIO_USE_SSL:'false',MINIO_ACCESS_KEY:'real-studio-qa',MINIO_SECRET_KEY:sec.minioPassword,MINIO_BUCKET:'real-studio-'+prior.id,JWT_ADMIN_ACCESS_SECRET:sec.jwtAdmin,JWT_CUSTOMER_ACCESS_SECRET:sec.jwtCustomer,PUSH_PROVIDER:'disabled',PUBLIC_BASE_URL:origin,API_PREFIX:'api',THROTTLE_LIMIT:'20000',RAPID_PRODUCT_INTAKE_ENABLED:'true',INVENTORY_MANAGEMENT_ENABLED:'true',IMAGE_OPTIMIZATION_ENABLED:'true',IMAGE_ENHANCEMENT_ENABLED:'true',IMAGE_ENHANCEMENT_LOCAL_ENABLED:'true',IMAGE_LOCAL_MATTING_ENABLED:'true',IMAGE_NEURAL_SEGMENTATION_ENABLED:'false',IMAGE_AI_ENABLED:'false',AI_RECOGNITION_ENABLED:'false',AI_LIVE_CALLS_APPROVED:'false',IMAGE_AI_LIVE_APPROVED:'false',PRODUCT_STUDIO_ENABLED:'true',PRODUCT_STUDIO_PROVIDER:live?'fal':'mock',PRODUCT_STUDIO_MOCK_APPROVED:'true',PRODUCT_STUDIO_LIVE_APPROVED:live?'true':'false',GEMINI_BRAND_STUDIO_ENABLED:'false',FAL_BRAND_STUDIO_ENABLED:'false',FAL_PREMIUM_3D_ENABLED:'false',REAL_PRODUCT_STUDIO_REVIEW_ENABLED:'true',REAL_PRODUCT_STUDIO_REVIEW_INDEX:path.join(prior.dir,'review-index.json'),
 AI_MONTHLY_BUDGET_USD:'10',AI_DAILY_BUDGET_USD:'10',IMAGE_AI_MONTHLY_BUDGET_USD:'10',IMAGE_AI_DAILY_BUDGET_USD:'10',IMAGE_AI_EMPLOYEE_DAILY_LIMIT:'100',IMAGE_AI_EMPLOYEE_HOURLY_LIMIT:'30'});
delete process.env.GEMINI_API_KEY;delete process.env.GOOGLE_API_KEY;delete process.env.FAL_KEY;
const index=JSON.parse(fs.readFileSync(path.join(prior.dir,'review-index.json'),'utf8'));
const chosen=['P01','P04','P10','P11','P13','P16'].map(tag=>index.photos.find(p=>p.tag===tag));
if(live){
 const account=JSON.parse(fs.readFileSync(path.join(m.out,'account-before.json'),'utf8'));
 const pricing=JSON.parse(fs.readFileSync(path.join(m.out,fs.readdirSync(m.out).filter(n=>/^pricing-.*\.json$/.test(n)).sort().at(-1)),'utf8'));
 assert.equal(pricing.status,200);assert.equal(pricing.price.unit,'units');assert.equal(pricing.price.unitPriceUsd,'1');assert.equal(pricing.price.currency,'USD');
 const key=fs.readFileSync('D:/rezona-phase7-2-qa/fal-pilot/backend.env','utf8').split(/\r?\n/).find(s=>s.startsWith('FAL_KEY='))?.slice(8).trim();assert.ok(key);
 Object.assign(process.env,{FAL_KEY:key,PRODUCT_STUDIO_PREPAID_EXPERIMENT:'true',PRODUCT_STUDIO_PREPAID_EVIDENCE_JSON:JSON.stringify(account),PRODUCT_STUDIO_PRIVATE_TRANSFER_APPROVED:'true',PRODUCT_STUDIO_TERMS_REVIEWED:'true',PRODUCT_STUDIO_MODEL_REVISION:'fal-nano-banana-lite-edit-reviewed-20261124',PRODUCT_STUDIO_APPROVAL_ID:account.approvalId,PRODUCT_STUDIO_MAX_CONCURRENCY:'1',PRODUCT_STUDIO_MAX_REGENERATIONS:'0',PRODUCT_STUDIO_MONTHLY_BUDGET_USD:'10',PRODUCT_STUDIO_DAILY_BUDGET_USD:'10',PRODUCT_STUDIO_PILOT_BUDGET_USD:'10',PRODUCT_STUDIO_PRIOR_COMMITMENT_USD:'1.044480',PRODUCT_STUDIO_MAX_REQUESTS:'200',PRODUCT_STUDIO_REVIEWED_PRICING_JSON:JSON.stringify({model:pricing.price.model,currency:'USD',unit:'units',unitPriceUsd:'1',maxBillableUnits:'0.174080',reviewedAt:pricing.at,quoteFingerprint:pricing.quoteFingerprint,evidenceId:'fal-reviewed-'+m.id,sourceUrl:pricing.sourceUrl})});
}
process.chdir(m.dir);
const fetch0=global.fetch;let transportCalls=0;
global.fetch=async(u,opts)=>{const url=new URL(String(u));if(url.origin===origin)return fetch0(u,opts);if(live&&url.href==='https://fal.run/google/nano-banana-lite/edit'&&opts?.method==='POST'){
 if(++transportCalls>chosen.length)throw Error('BATCH_SCOPE_EXCEEDED');
 const number=transportCalls,at=new Date().toISOString(),r=await fetch0(u,opts),reader=r.clone().body?.getReader(),chunks=[];let size=0;
 if(reader)for(;;){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>18*1024*1024){await reader.cancel();throw Error('QA_RESPONSE_TOO_LARGE');}chunks.push(v.value);}
 let b;try{b=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{b={};}
 // Preserve a rejected provider raster privately too, never an unrestricted URL or raw error body.
 let rawImage=null;const inline=b.images?.[0]?.url;
 if(typeof inline==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(inline)&&inline.length<17*1024*1024){rawImage=path.join(m.dir,'fal-transport-'+number+'-response.'+inline.match(/^data:image\/([^;]+)/)[1]);fs.writeFileSync(rawImage,Buffer.from(inline.split(',')[1],'base64'),{flag:'wx'});}
 write('transport-'+number+'-'+Date.now()+'.json',{at,status:r.status,requestId:r.headers.get('x-fal-request-id'),reportedBillableUnits:r.headers.get('x-fal-billable-units'),rawImage:rawImage?path.basename(rawImage):null,imageSha256:rawImage?sha(fs.readFileSync(rawImage)):null,responseBytes:size});return r;
 }throw Error('UNAUTHORIZED_NETWORK');};
require('reflect-metadata');
(async()=>{
 const {NestFactory}=require('@nestjs/core'),{ValidationPipe}=require('@nestjs/common');
 const app=await NestFactory.create(require(path.join(dist,'src/app.module')).AppModule,{logger:['error','warn']});
 app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
 app.useGlobalFilters(new(require(path.join(dist,'src/common/filters/http-exception.filter')).HttpExceptionFilter)());
 app.useGlobalInterceptors(new(require(path.join(dist,'src/common/interceptors/response-envelope.interceptor')).ResponseEnvelopeInterceptor)());
 const db=app.get(require(path.join(dist,'src/prisma/prisma.service')).PrismaService),config=app.get(require('@nestjs/config').ConfigService);
 if(live){const {studioTemplate,studioPromptHash}=require(path.join(dist,'src/image-enhancement/studio-templates'));
  config.set('PRODUCT_STUDIO_APPROVED_SCOPE_JSON',JSON.stringify(chosen.map(p=>{const t=studioTemplate(p.recommendedTemplateId,1);return {templateId:t.id,version:1,mode:'GENERATIVE_3D_HERO',promptHash:studioPromptHash(t,'GENERATIVE_3D_HERO')}})));
  config.set('PRODUCT_STUDIO_APPROVED_SOURCES_JSON',JSON.stringify(await Promise.all(chosen.map(async p=>({sourceHash:(await db.productIntakeImage.findUniqueOrThrow({where:{sessionId_clientImageId:{sessionId:p.sessionId,clientImageId:p.clientImageId}}})).requestHash,referenceKind:'ORIGINAL_REFERENCE'})))));
 }
 await app.listen(18528,'127.0.0.1');
 try{
  const login=await fetch(origin+'/api/admin/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:sec.email,password:sec.password})}),logged=await login.json();assert.ok(login.ok&&logged.data?.accessToken);
  const request=async(method,url,body,auth=true)=>{const r=await fetch(origin+'/api'+url,{method,headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+logged.data.accessToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')}};
  const expect=async(p,status=201)=>{const r=await p;assert.equal(r.status,status,JSON.stringify(r.body));return r.body.data};
  const ep=p=>'/admin/product-intake/sessions/'+p.sessionId+'/enhancements';
  const business=async()=>{const c={};for(const k of['productListing','customer','warehouse','inventoryBalance','inventoryMovement','order','auction','customerWallet'])c[k]=await db[k].count();return c;};
  const before={business:await business(),sessions:await db.productIntakeSession.findMany({orderBy:{id:'asc'}}),decisions:await db.productImageEnhancementDecision.count()};
  assert.ok(Object.values(before.business).every(n=>n===0));
  const review=await expect(request('GET','/admin/product-intake/studio-review'),200);assert.equal(review.photos.length,17);assert.ok(review.photos.every(p=>p.originalReferenceValid));
  const rows=[];
  if(mode==='paid'||mode==='checks')for(const p of live?chosen:[index.photos.find(p=>p.tag==='P04')]){
   const body={clientImageId:p.clientImageId,requestKey:'real-fal-'+m.id+'-'+mode+'-'+p.tag,mode:'PRODUCT_STUDIO_HERO',referenceKind:'ORIGINAL_REFERENCE',originalReferenceReviewed:true,sourceWarningsReviewed:true,generativeProductApproved:true,privateTransferApproved:live,studioSelection:{templateId:p.recommendedTemplateId,templateVersion:1,processingMode:'GENERATIVE_3D_HERO',sourceKind:p.sourceKind}};
   if(!live){await expect(request('POST',ep(p),{...body,referenceKind:'ORIGINAL_REFERENCE',mode:'PRODUCT_STUDIO_FAITHFUL',studioSelection:{...body.studioSelection,processingMode:'FAITHFUL_COMPOSITE'}}),400);await expect(request('POST',ep(p),{...body,sourceWarningsReviewed:false}),400);await expect(request('POST',ep(p),body,false),401);}
   if(live)fs.writeFileSync(path.join(m.dir,'dispatch-intent-'+p.tag+'.json'),JSON.stringify({at:new Date().toISOString(),photoId:p.photoId,template:body.studioSelection,requestKey:body.requestKey},null,2),{flag:'wx'});
   await expect(request('POST',ep(p),body));
   const req=await db.productImageEnhancementRequest.findUniqueOrThrow({where:{sessionId_requestKey:{sessionId:p.sessionId,requestKey:body.requestKey}}});
   const until=Date.now()+150000;let job;
   do{job=await db.productImageEnhancementJob.findUniqueOrThrow({where:{id:req.jobId},include:{candidate:{include:{asset:true}}}});if(!['PENDING','PROCESSING'].includes(job.status))break;await new Promise(r=>setTimeout(r,300));}while(Date.now()<until);
   const usage=await db.recognitionUsage.findFirst({where:{enhancementJobId:job.id}});
   const row={tag:p.tag,photoId:p.photoId,label:p.label,segmentationStatus:p.segmentationStatus,sourceStatus:p.sourceStatus,template:body.studioSelection,sourceHash:job.sourceHash,referenceKind:'ORIGINAL_REFERENCE',jobId:job.id,status:job.status,errorCode:job.errorCode,provider:job.provider,providerRequestId:job.providerRequestId,startedAt:job.startedAt,completedAt:job.completedAt,metrics:job.metrics,candidateId:job.candidate?.id ?? null,mediaRole:job.candidate?.mediaRole ?? null,qualityStatus:job.candidate?.qualityStatus ?? null,details:job.candidate?.processingDetails ?? null,warnings:job.candidate?.warnings ?? [],usage:usage?{status:usage.status,reservedUsd:usage.reservedUsd,committedUsd:usage.committedUsd,estimatedUsd:usage.estimatedUsd,details:usage.usageDetails}:null,actualBilledUsd:'UNKNOWN',employeeReview:'PENDING',selected:false};
   write(mode+'-'+p.tag+'-'+Date.now()+'.json',row);rows.push(row);console.log(JSON.stringify({tag:p.tag,status:job.status,requestId:job.providerRequestId,estimatedUsd:usage?.estimatedUsd ?? null}));
   if(job.candidate){const preview=await request('GET',ep(p)+'/candidates/'+job.candidate.id+'/preview');assert.equal(preview.status,200);assert.ok(preview.cache?.includes('no-store'));fs.writeFileSync(path.join(m.dir,p.tag+'-'+(live?'REAL-FAL':'MOCK-'+Date.now())+'.webp'),Buffer.from(preview.body.data.base64,'base64'),{flag:'wx'});assert.ok(job.candidate.asset.intakePrivate);assert.equal(job.candidate.asset.intakeProductId,null);const pub=await fetch(origin+'/media/'+job.candidate.asset.key);assert.equal(pub.status,404);}
   if(!live){assert.equal(job.status,'COMPLETED');assert.equal(job.candidate.mediaRole,'AI_PROMOTIONAL');assert.equal(job.candidate.maskAssetId,null);assert.equal(job.candidate.processingDetails.opaqueRgbPreserved,false);const old=job.id;await expect(request('POST',ep(p),body));assert.equal((await db.productImageEnhancementRequest.findUniqueOrThrow({where:{sessionId_requestKey:{sessionId:p.sessionId,requestKey:body.requestKey}}})).jobId,old);await expect(request('POST',ep(p),{...body,sourceWarningsReviewed:false}),400);}
   if(live && (job.status!=='COMPLETED'||usage?.status!=='REPORTED'||!usage.estimatedUsd||!job.providerRequestId))break;
  }
  if(mode==='review')for(const tag of ['P13','P16']){
   const p=index.photos.find(p=>p.tag===tag),row=JSON.parse(fs.readFileSync(path.join(m.out,fs.readdirSync(m.out).find(n=>n.startsWith('paid-'+tag+'-'))),'utf8'));
   const state=await expect(request('GET',ep(p)),200);
   await expect(request('POST',ep(p)+'/decision',{clientImageId:p.clientImageId,requestKey:'material-reject-'+m.id+'-'+tag,expectedRevision:state.businessRevision,expectedMediaRevision:state.mediaRevision,expectedDecisionRevision:state.decisionRevision,action:'REJECT',candidateId:row.candidateId,reviewed:true,materialMismatchObserved:true}));
   const decision=await db.productImageEnhancementDecision.findUniqueOrThrow({where:{sessionId_requestKey:{sessionId:p.sessionId,requestKey:'material-reject-'+m.id+'-'+tag}}});
   assert.equal(decision.action,'REJECT');assert.equal(decision.selectedCandidateId,null);rows.push({tag,decisionId:decision.id,action:'REJECT',reviewer:'QA_AGENT_VISUAL_REVIEW_NOT_OWNER_ACCEPTANCE',reason:tag==='P13'?'Printed projector illustration reconstructed as an unboxed device; package text moved onto pedestal':'Visible brand and small label text rewritten into incorrect lettering'});
  }
  assert.deepEqual(await business(),before.business);
  const sessions=await db.productIntakeSession.findMany({orderBy:{id:'asc'}});
  const businessFields=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!['updatedAt','imageDecisionRevision'].includes(k)));
  assert.deepEqual(sessions.map(businessFields),before.sessions.map(businessFields));
  assert.equal(await db.productImageEnhancementDecision.count(),before.decisions+(mode==='review'?2:0));
  assert.equal(await db.productImageEnhancementDecision.count({where:{action:'ACCEPT'}}),0);
  const afterReview=await expect(request('GET','/admin/product-intake/studio-review'),200);write(mode+'-summary-'+Date.now()+'.json',{mode,rows,transportCalls,photos:afterReview.photos.length,originalReferencesValid:17,sourceTemplatePairs:340,unchangedBusiness:true,unchangedSessionBusinessFields:true,qaRejections:mode==='review'?2:0,automaticAcceptance:false});
  fs.writeFileSync(path.join(m.dir,mode+'-review-'+Date.now()+'.json'),JSON.stringify(afterReview,null,2),{flag:'wx'});
 }finally{await app.close();}
})().catch(e=>{console.error(String(e.message).replaceAll(sec.postgresPassword,'[REDACTED]').replaceAll(sec.password,'[REDACTED]'));process.exitCode=1});
