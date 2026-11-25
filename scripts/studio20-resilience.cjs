const assert=require('node:assert/strict'),sharp=require('sharp'),{randomUUID}=require('node:crypto');
module.exports=async c=>{
 const h=await require('./phase7-2-checks.cjs').helpers(c),{draft,start,wait,status,ok,ep}=h;
 const {ImageEditingProvider,ImageProviderError}=require('../dist/src/image-enhancement/enhancement.provider'),{ImageEnhancementService}=require('../dist/src/image-enhancement/enhancement.service');
 const p=c.app.get(ImageEditingProvider),service=c.app.get(ImageEnhancementService);
 const photo=await sharp(Buffer.from('<svg width="700" height="800"><rect width="700" height="800" fill="#eeeeee"/><rect x="150" y="100" width="400" height="600" fill="#245346"/></svg>')).jpeg().toBuffer();
 const s=await draft(photo),loc=await start(s,'NEURAL_BACKGROUND_REMOVE'),local=await wait(s,loc.jobs[0].id);let st=await status(s);
 await ok(c.request('POST',ep(s)+'/decision',{clientImageId:s.selectedImageKey,requestKey:randomUUID(),expectedRevision:s.revision,expectedMediaRevision:st.mediaRevision,expectedDecisionRevision:st.decisionRevision,action:'ACCEPT',candidateId:local.candidate.id,reviewed:true}));
 const original=p.productStudio.bind(p);p.productStudio=async()=>{throw new ImageProviderError('FAL_STUDIO_OUTCOME_UNKNOWN',true);};
 const body={clientImageId:s.selectedImageKey,requestKey:randomUUID(),mode:'PRODUCT_STUDIO_HERO',studioSelection:{templateId:'REZONA_ELECTRONICS_TECH_DESK_V1',templateVersion:1,processingMode:'GENERATIVE_3D_HERO',sourceKind:'BOX'},sourceCandidateId:local.candidate.id,maskReviewed:true,generativeProductApproved:true};
 await ok(c.request('POST',ep(s),body));const record=await c.db.productImageEnhancementRequest.findUniqueOrThrow({where:{sessionId_requestKey:{sessionId:s.id,requestKey:body.requestKey}}});
 await wait(s,record.jobId,'UNKNOWN');p.productStudio=original;
 const usage=await c.db.recognitionUsage.findFirstOrThrow({where:{enhancementJobId:record.jobId}});assert.equal(usage.status,'UNKNOWN');
 await service.recover();assert.equal((await c.db.productImageEnhancementJob.findUniqueOrThrow({where:{id:record.jobId}})).status,'UNKNOWN');
 const calls=p.calls,alias=await ok(c.request('POST',ep(s),{...body,requestKey:randomUUID()}));assert.equal(alias.jobs.find(j=>j.id===record.jobId).status,'UNKNOWN');assert.equal(p.calls,calls);
 for(const [action,candidateId]of [['ORIGINAL',undefined],['ACCEPT',local.candidate.id]]){
   const now=await status(s);await ok(c.request('POST',ep(s)+'/decision',{clientImageId:s.selectedImageKey,requestKey:randomUUID(),expectedRevision:s.revision,expectedMediaRevision:now.mediaRevision,expectedDecisionRevision:now.decisionRevision,action,candidateId,reviewed:true}));
 }
 await ok(c.request('POST',ep(s),{...body,requestKey:randomUUID()}),409);
 assert.equal((await c.db.recognitionUsage.findUniqueOrThrow({where:{id:usage.id}})).committedUsd.toString(),usage.committedUsd.toString());
 c.checks.push('Library mock ambiguous dispatch -> durable UNKNOWN; restart/recovery cannot redispatch, identical source requests blocked; original mask/photo and reserved ledger retained; no paid traffic');
};
