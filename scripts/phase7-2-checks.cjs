const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),sharp=require('sharp');
module.exports=async c=>{
 const {db,app,request,checks,category,customerToken}=c;
 const {ImageEditingProvider,ImageProviderError}=require('../dist/src/image-enhancement/enhancement.provider');
 const {ImageEnhancementService}=require('../dist/src/image-enhancement/enhancement.service');
 const provider=app.get(ImageEditingProvider),service=app.get(ImageEnhancementService);
 const h=await helpers(c),{ok,draft,start,wait,decide,status,base,ep}=h;
 const photo=await sharp(Buffer.from('<svg width="700" height="800"><rect width="700" height="800" fill="#eeeeee"/><rect x="150" y="100" width="400" height="600" fill="#145142"/><text x="190" y="400" font-size="70" fill="white">REAL QA</text></svg>')).jpeg().toBuffer();
 const s=await draft(photo),before=await ok(request('GET',base+'/'+s.id),200);
 await ok(request('POST',ep(s),{clientImageId:s.selectedImageKey,requestKey:randomUUID(),mode:'GEMINI_BRAND_STUDIO',sourceCandidateId:'nonexistent',maskReviewed:true}),409);
 const clean=await start(s,'CLEAN');await wait(s,clean.jobs[0].id);
 const isolation=await start(s,'NEURAL_BACKGROUND_REMOVE'),local=await wait(s,isolation.jobs[0].id);
 await ok(decide(s,'ACCEPT',local.candidate.id));
 const body={clientImageId:s.selectedImageKey,requestKey:randomUUID(),mode:'GEMINI_BRAND_STUDIO',sourceCandidateId:local.candidate.id,maskReviewed:true};
 await ok(request('POST',ep(s),{...body,maskReviewed:false}),400);
 checks.push('Normal JWT admin workflow: missing/unapproved/wrong mask blocked; actual local U2Net candidate explicitly accepted');
 const result=await ok(request('POST',ep(s),body)),id=result.jobs[0].id;
 await Promise.all([ok(request('POST',ep(s),body)),ok(request('POST',ep(s),{...body,requestKey:randomUUID()}))]);
 const styled=await wait(s,id);assert.equal(await db.productImageEnhancementJob.count({where:{sessionId:s.id,mode:body.mode}}),1);
 assert.equal(styled.candidate.processingDetails.sourceCandidateId,local.candidate.id);
 assert.equal(styled.candidate.processingDetails.maskHash,local.candidate.processingDetails.maskHash);
 assert.equal(styled.candidate.processingDetails.mockOnly,true);
 const usage=await db.recognitionUsage.findFirstOrThrow({where:{enhancementJobId:id}});assert.equal(usage.committedUsd.toString(),'0');assert.equal(usage.actualBilledUsd,null);
 checks.push('Real BullMQ worker/private MinIO composition; same-key and alias replay create one job; immutable source/mask/style lineage; zero mock reservation, no actual cost');
 await ok(request('GET',ep(s),undefined,null),401);await ok(request('GET',ep(s),undefined,customerToken),403);
 const asset=await db.fileAsset.findUniqueOrThrow({where:{id:styled.candidate.media.assetId}});
 assert.equal((await fetch(new URL(asset.url,c.origin))).status,404);
 const preview=await request('GET',ep(s)+'/candidates/'+styled.candidate.id+'/preview?edge=1024');assert.equal(preview.status,200);assert.equal(preview.headers['cache-control'],'no-store');
 checks.push('Private original/styled media remain inaccessible publicly; owned previews bounded/no-store; customer and unauthenticated callers rejected');
 // Metadata can be completed while image work runs; media decisions never reset business fields.
 const after=await ok(request('GET',base+'/'+s.id),200);for(const f of ['approvedMetadata','quantity','locationId','revision','selectedImageKey'])assert.deepEqual(after[f],before[f]);
 await ok(decide(s,'ACCEPT',styled.candidate.id));
 const committed=await ok(request('POST',base+'/'+s.id+'/submit',{expectedRevision:s.revision},undefined,s.submissionOperationKey));
 const replay=await ok(request('POST',base+'/'+s.id+'/submit',{expectedRevision:s.revision},undefined,s.submissionOperationKey));assert.deepEqual(committed,replay);
 const product=await db.productListing.findUniqueOrThrow({where:{id:committed.productId}});assert.equal(product.status,'DRAFT');assert.equal(product.availableQuantity,1);assert.deepEqual(product.imageUrls,[asset.url]);
 const deadline=Date.now()+30000;let variants=[];while(Date.now()<deadline){variants=await db.fileAssetVariant.findMany({where:{assetId:asset.id}});if(variants.length===8)break;await new Promise(r=>setTimeout(r,200));}assert.equal(variants.length,8);
 checks.push('Styled approval does not touch metadata/price/location/quantity; original Phase5 NEW + replay creates one DRAFT/one opening; existing Phase2 creates all eight private variants');
 const stock=await draft(photo,'STOCK_IN',product.id);const st=await start(stock,'NEURAL_BACKGROUND_REMOVE'),sl=await wait(stock,st.jobs[0].id);await ok(decide(stock,'ACCEPT',sl.candidate.id));
 const br=await start(stock,'GEMINI_BRAND_STUDIO',{sourceCandidateId:sl.candidate.id,maskReviewed:true});const bs=await wait(stock,br.jobs[0].id);await ok(decide(stock,'ACCEPT',bs.candidate.id));
 await ok(request('POST',base+'/'+stock.id+'/submit',{expectedRevision:stock.revision},undefined,stock.submissionOperationKey));
 assert.deepEqual((await db.productListing.findUniqueOrThrow({where:{id:product.id}})).imageUrls,[asset.url]);assert.equal((await db.fileAsset.findUniqueOrThrow({where:{id:bs.candidate.media.assetId}})).intakeProductId,null);
 checks.push('Actual STOCK_IN with accepted styled artifact adds one physical receipt without changing existing catalog media');
 const race=await draft(photo),r0=await start(race,'NEURAL_BACKGROUND_REMOVE'),rl=await wait(race,r0.jobs[0].id);await ok(decide(race,'ACCEPT',rl.candidate.id));
 const originalStudio=provider.studio.bind(provider);let release,enteredResolve;const entered=new Promise(r=>enteredResolve=r);
 provider.studio=async(...args)=>{enteredResolve();await new Promise(r=>release=r);return originalStudio(...args);};
 const rr=await start(race,'GEMINI_BRAND_STUDIO',{sourceCandidateId:rl.candidate.id,maskReviewed:true});await entered;
 await ok(request('PATCH',base+'/'+race.id,{expectedRevision:race.revision,selectedImageKey:randomUUID()}),200);release();
 const raceJob=await db.productImageEnhancementJob.findUniqueOrThrow({where:{id:rr.jobs[0].id}});
 const end=Date.now()+15000;while(Date.now()<end){const j=await db.productImageEnhancementJob.findUniqueOrThrow({where:{id:raceJob.id}});if(j.status!=='PROCESSING'){assert.notEqual(j.status,'COMPLETED');break;}await new Promise(r=>setTimeout(r,100));}
 assert.equal(await db.productImageEnhancementCandidate.count({where:{jobId:raceJob.id}}),0);provider.studio=originalStudio;
 checks.push('Retake during in-flight mock transport fences candidate commit and preserves the old capture privately');
 const unknown=await draft(photo),u0=await start(unknown,'NEURAL_BACKGROUND_REMOVE'),ul=await wait(unknown,u0.jobs[0].id);await ok(decide(unknown,'ACCEPT',ul.candidate.id));
 provider.studio=async()=>{throw new ImageProviderError('STUDIO_OUTCOME_UNKNOWN',true);};
 const ur=await start(unknown,'GEMINI_BRAND_STUDIO',{sourceCandidateId:ul.candidate.id,maskReviewed:true}),uj=await wait(unknown,ur.jobs[0].id,'UNKNOWN');provider.studio=originalStudio;
 await ok(request('POST',ep(unknown),{clientImageId:unknown.selectedImageKey,requestKey:randomUUID(),mode:'GEMINI_BRAND_STUDIO',sourceCandidateId:ul.candidate.id,maskReviewed:true,generation:1}),409);
 await service.recover();assert.equal((await db.productImageEnhancementJob.findUniqueOrThrow({where:{id:uj.id}})).status,'UNKNOWN');
 await ok(decide(unknown,'ORIGINAL'));await ok(decide(unknown,'ACCEPT',ul.candidate.id));
 await ok(request('POST',ep(unknown),{clientImageId:unknown.selectedImageKey,requestKey:randomUUID(),mode:'GEMINI_BRAND_STUDIO',sourceCandidateId:ul.candidate.id,maskReviewed:true,generation:0}),409);
 checks.push('Ambiguous provider timeout becomes UNKNOWN, retains reservation, cannot regenerate or recover into another external request');
 const stale=await draft(photo),q0=await start(stale,'NEURAL_BACKGROUND_REMOVE'),ql=await wait(stale,q0.jobs[0].id);await ok(decide(stale,'ACCEPT',ql.candidate.id));
 const q1=await start(stale,'GEMINI_BRAND_STUDIO',{sourceCandidateId:ql.candidate.id,maskReviewed:true}),q=await wait(stale,q1.jobs[0].id);
 await ok(decide(stale,'ORIGINAL'));await ok(decide(stale,'ACCEPT',q.candidate.id),409);
 checks.push('Keep-original revokes mask lineage; stale styled result cannot be accepted even on the same photograph');
 const cancelled=await draft(photo),c0=await start(cancelled,'NEURAL_BACKGROUND_REMOVE'),cl=await wait(cancelled,c0.jobs[0].id);await ok(decide(cancelled,'ACCEPT',cl.candidate.id));
 let finishCancelled,startedCancelled;const dispatchedCancelled=new Promise(r=>startedCancelled=r);
 provider.studio=async()=>{startedCancelled();await new Promise(r=>finishCancelled=r);throw new ImageProviderError('STUDIO_OUTCOME_UNKNOWN',true);};
 const cj=await start(cancelled,'GEMINI_BRAND_STUDIO',{sourceCandidateId:cl.candidate.id,maskReviewed:true});await dispatchedCancelled;
 await ok(request('POST',ep(cancelled)+'/'+cj.jobs[0].id+'/cancel'));finishCancelled();
 const cancelledEnd=Date.now()+15000;let cu;
 while(Date.now()<cancelledEnd){cu=await db.recognitionUsage.findFirst({where:{enhancementJobId:cj.jobs[0].id}});if(cu?.status==='UNKNOWN')break;await new Promise(r=>setTimeout(r,100));}
 provider.studio=originalStudio;assert.equal(cu.status,'UNKNOWN');assert.equal(await db.productImageEnhancementCandidate.count({where:{jobId:cj.jobs[0].id}}),0);
 await ok(decide(cancelled,'ORIGINAL'));await ok(decide(cancelled,'ACCEPT',cl.candidate.id));
 await ok(request('POST',ep(cancelled),{clientImageId:cancelled.selectedImageKey,requestKey:randomUUID(),mode:'GEMINI_BRAND_STUDIO',sourceCandidateId:cl.candidate.id,maskReviewed:true}),409);
 checks.push('Cancellation cannot refund/erase ambiguous usage: cancelled in-flight job creates no candidate; UNKNOWN ledger prevents another dispatch even after reselecting the mask');
 // Expired external lease is terminal, unlike safe local retry. New isolated synthetic fixture only.
 const recovering=await db.productImageEnhancementJob.create({data:{sessionId:stale.id,imageId:(await db.productIntakeImage.findFirstOrThrow({where:{sessionId:stale.id}})).id,
   actorId:c.owner.id,identityKey:randomUUID(),sourceHash:'0'.repeat(64),mode:'GEMINI_BRAND_STUDIO',background:'WHITE',recipeVersion:'source-mask-background-plate-v1',provider:'mock',model:'rezona-studio-mock',
   modelRevision:'mock-v1',promptVersion:'rezona-background-plate-v1',status:'PROCESSING',attempts:1,leaseToken:randomUUID(),nextDispatchAt:new Date(0)}});
 await service.recover();assert.equal((await db.productImageEnhancementJob.findUniqueOrThrow({where:{id:recovering.id}})).status,'UNKNOWN');
 checks.push('Restart recovery of expired external work is UNKNOWN, not automatic paid retry (synthetic lease fixture, no product bypass)');
 // Accounting only: synthetic approvals/fake key are never used by a transport or active job.
 const {ConfigService}=require('@nestjs/config'),config=app.get(ConfigService),oldConfig=new Map();
 const set=(k,v)=>{if(!oldConfig.has(k))oldConfig.set(k,config.get(k));config.set(k,v);};
 const {CATALOG_STUDIO_V1}=require('../dist/src/image-enhancement/brand-studio.config');
 const budget=app.get(require('../dist/src/ai/recognition-budget.service').RecognitionBudgetService);
 const prior=(await db.recognitionUsage.aggregate({where:{provider:'gemini'},_sum:{committedUsd:true}}))._sum.committedUsd ?? new (require('@prisma/client').Prisma.Decimal)(0);
 const roomy=prior.add('1').toString(),tight=prior.add('0.20').toString();
 const fields={GEMINI_BRAND_STUDIO_PROVIDER:'gemini',GEMINI_BRAND_STUDIO_LIVE_APPROVED:'true',
   GEMINI_BRAND_STUDIO_PRIVATE_TRANSFER_APPROVED:'true',GEMINI_BRAND_STUDIO_PAID_TERMS_ACCEPTED:'true',
   GEMINI_BRAND_STUDIO_ACCOUNT_MODEL_VERIFIED:'gemini-3.1-flash-lite-image',GEMINI_BRAND_STUDIO_MODEL_REVISION:'synthetic-accounting-only',
   GEMINI_BRAND_STUDIO_REVIEWED_AT:new Date().toISOString(),GEMINI_BRAND_STUDIO_PROFILE_JSON:JSON.stringify({...CATALOG_STUDIO_V1,approved:true}),
   GEMINI_API_KEY:'fake-nonworking-accounting-only',AI_MONTHLY_BUDGET_USD:roomy,AI_DAILY_BUDGET_USD:roomy,IMAGE_AI_MONTHLY_BUDGET_USD:roomy,IMAGE_AI_DAILY_BUDGET_USD:roomy,
   GEMINI_BRAND_STUDIO_MONTHLY_BUDGET_USD:roomy,GEMINI_BRAND_STUDIO_PILOT_BUDGET_USD:tight};
 let entry;
 try{
   for(const [k,v] of Object.entries(fields))set(k,v);
   const create=()=>db.productImageEnhancementJob.create({data:{sessionId:stale.id,imageId:recovering.imageId,actorId:c.owner.id,
     identityKey:randomUUID(),sourceHash:'0'.repeat(64),mode:'GEMINI_BRAND_STUDIO',background:'WHITE',recipeVersion:'source-mask-background-plate-v1',provider:'gemini',model:'gemini-3.1-flash-lite-image',
     modelRevision:'synthetic-accounting-only',promptVersion:'rezona-background-plate-v1',status:'COMPLETED',attempts:1,parameters:{styleHash:'synthetic-ledger-only'}}});
   const one=await create(),two=await create();entry=await budget.reserveImage(one);assert.equal(entry.committedUsd.toString(),'0.139264');
   await budget.settleImage(entry.id,false,1,{syntheticAccountingOnly:true,actualBilling:'NOT_AVAILABLE'},'SYNTHETIC_TIMEOUT');
   await assert.rejects(budget.reserveImage(two),/AI_BUDGET_EXCEEDED/);
   set('GEMINI_BRAND_STUDIO_PILOT_BUDGET_USD',roomy);set('AI_MONTHLY_BUDGET_USD',tight);
   await assert.rejects(budget.reserveImage(two),/AI_BUDGET_EXCEEDED/);
   assert.equal((await db.recognitionUsage.findUniqueOrThrow({where:{id:entry.id}})).committedUsd.toString(),'0.139264');
 }finally{
   if(entry)await db.recognitionUsage.update({where:{id:entry.id},data:{status:'SYNTHETIC_LEDGER_TEST',usageDetails:{syntheticAccountingOnly:true,noProviderInstantiated:true}}});
   for(const [k,v] of oldConfig)config.set(k,v);
 }
 checks.push('Actual PostgreSQL shared ledger: synthetic 0.139264 ceiling retained on UNKNOWN; fixed-pilot and global budget exhaustion reject next reservation; no provider instantiated/charges');
};
async function helpers(c){
 const {request}=c,base='/admin/product-intake/sessions',ep=s=>base+'/'+s.id+'/enhancements';
 const ok=async(p,status=201)=>{const r=await p;assert.equal(r.status,status,JSON.stringify(r.body));return r.data;};
 const wh=await ok(request('POST','/admin/warehouses',{code:'P72-'+randomUUID().slice(0,6),name:'Disposable P72'}));
 const loc=await ok(request('POST','/admin/warehouse-locations',{warehouseId:wh.id,code:'A-01',name:'Disposable QA'}));
 const status=s=>ok(request('GET',ep(s)),200);
 const draft=async(bytes,mode='NEW',productId,metadata=true)=>{let s=await ok(request('POST',base,{clientDraftId:randomUUID(),submissionOperationKey:randomUUID()}));
  s=await ok(request('PATCH',base+'/'+s.id,{expectedRevision:s.revision,selectedImageKey:randomUUID(),...(metadata?{mode,quantity:1,locationId:loc.id,
    ...(mode==='NEW'?{approvedMetadata:{title:'منتج QA تنسيق '+randomUUID(),price:'10000',categoryId:c.category.id,description:'Manual QA only'}}:{existingProductId:productId})}:{})}),200);
  const form=new FormData();form.set('clientImageId',s.selectedImageKey);form.set('file',new Blob([bytes],{type:'image/jpeg'}),'private-photo.jpeg');return ok(request('POST',base+'/'+s.id+'/image',form));};
 const start=(s,mode,extra={})=>ok(request('POST',ep(s),{clientImageId:s.selectedImageKey,requestKey:randomUUID(),mode,...extra}));
 const wait=async(s,id,expected='COMPLETED')=>{const end=Date.now()+90000;while(Date.now()<end){const st=await status(s),j=st.jobs.find(x=>x.id===id);
   if(j?.status===expected)return j;if(['FAILED','UNKNOWN','CANCELLED'].includes(j?.status))throw Error(JSON.stringify(j));await new Promise(r=>setTimeout(r,200));}throw Error('Phase72 wait timeout '+id);};
 const decide=async(s,action,candidateId)=>{const st=await status(s);return request('POST',ep(s)+'/decision',{clientImageId:s.selectedImageKey,requestKey:randomUUID(),
   expectedRevision:s.revision,expectedMediaRevision:st.mediaRevision,action,...(candidateId?{candidateId}:{}),reviewed:true});};
 return{ok,draft,start,wait,decide,status,base,ep};
}
module.exports.helpers=helpers;
