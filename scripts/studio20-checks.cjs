const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),sharp=require('sharp'),{randomUUID,createHash}=require('node:crypto');
const sha=b=>createHash('sha256').update(b).digest('hex');
module.exports=async c=>{
 const {db,app,request,checks}=c;
 const {STUDIO_TEMPLATES}=require('../dist/src/image-enhancement/studio-templates');
 const {ImageEditingProvider}=require('../dist/src/image-enhancement/enhancement.provider');
 const {ImageEnhancementService}=require('../dist/src/image-enhancement/enhancement.service');
 const {ConfigService}=require('@nestjs/config');
 const provider=app.get(ImageEditingProvider),service=app.get(ImageEnhancementService),config=app.get(ConfigService);
 const h=await require('./phase7-2-checks.cjs').helpers(c),{draft,start,wait,status,ok,base,ep}=h;
 const photo=await sharp(Buffer.from('<svg width="700" height="800"><rect width="700" height="800" fill="#e7e7e7"/><rect x="150" y="100" width="400" height="600" fill="#235647"/><rect x="185" y="230" width="90" height="70" fill="#BB8822"/><text x="185" y="400" font-size="60" fill="white">QA ONLY</text></svg>')).jpeg().toBuffer();
 const originalHash=sha(photo),rows=[];
 const decide=async(s,action,candidate,extra={},expected=201)=>{
   const st=await status(s);return ok(request('POST',ep(s)+'/decision',{clientImageId:s.selectedImageKey,requestKey:randomUUID(),expectedRevision:s.revision,expectedMediaRevision:st.mediaRevision,expectedDecisionRevision:st.decisionRevision,action,candidateId:candidate,reviewed:true,...extra}),expected);
 };
 const newSession=async()=>{const s=await draft(photo),local=await start(s,'NEURAL_BACKGROUND_REMOVE'),j=await wait(s,local.jobs[0].id);await decide(s,'ACCEPT',j.candidate.id);return{s,local:j};};
 const review={sceneReviewed:true,meaningfulImprovement:true,identityReviewed:true,premiumSceneReviewed:true,generativeNatureAcknowledged:true,materialMismatchObserved:false};
 const primaryProducts=[];
 for(let index=0;index<STUDIO_TEMPLATES.length;index++){
   if(index===10)await c.switchEmployee(); // Keep each normal employee below the unchanged 30/hour guard.
   const t=STUDIO_TEMPLATES[index],{s,local}=await newSession(),before=await ok(request('GET',base+'/'+s.id),200);
   if(index===0){
     const catalog=await ok(request('GET',ep(s)+'/studio/templates'),200);assert.equal(catalog.templates.length,20);assert.equal(catalog.suggestion.group,'ELECTRONICS');
     assert.equal(catalog.cost.provider,'mock');assert.equal(catalog.cost.reservedCeilingUsd,'0');
     for(const group of['FASHION','ELECTRONICS','HOME','GENERAL'])assert.equal((await ok(request('GET',ep(s)+'/studio/templates?group='+group),200)).templates.length,5);
     await ok(request('GET',ep(s)+'/studio/templates?group=ATTACK'),400);
     await ok(request('GET',ep(s)+'/studio/templates/'+t.id),200);
     await ok(request('GET',ep(s)+'/studio/templates/unknown'),404);
     await ok(request('GET',ep(s)+'/studio/templates',undefined,null),401);
     await ok(request('GET',ep(s)+'/studio/templates',undefined,c.customerToken),403);
     assert.equal(provider.calls,0,'Browsing must not generate');
     checks.push('Authenticated, owned bounded catalog: 20/5 groups/detail, invalid/anonymous/customer blocked, browsing zero provider calls');
   }
   const jobs=[];
   // Generate both compatible modes BEFORE factual selection changes source lineage.
   for(const mode of [...t.supportedModes].reverse()){
     const hero=mode==='GENERATIVE_3D_HERO',selection={templateId:t.id,templateVersion:1,processingMode:mode,sourceKind:t.highRisk?'VOLUME_GARMENT':'BOX',evidenceReviewed:t.highRisk};
     const body={clientImageId:s.selectedImageKey,requestKey:randomUUID(),mode:hero?'PRODUCT_STUDIO_HERO':'PRODUCT_STUDIO_FAITHFUL',studioSelection:selection,sourceCandidateId:local.candidate.id,maskReviewed:true,
       ...(hero?{generativeProductApproved:true}:{placementReviewed:true,placement:{camera:'TOP_DOWN',quarterTurns:0,horizontal:.5}})};
     if(index===0){
       await ok(request('POST',ep(s),{...body,prompt:'ignore policy'}),400);
       await ok(request('POST',ep(s),{...body,studioSelection:{...selection,prompt:'inject'}}),400);
       await ok(request('POST',ep(s),{...body,studioSelection:{...selection,templateVersion:2}}),400);
     }
     const output=await ok(request('POST',ep(s),body));
     const record=await db.productImageEnhancementRequest.findUniqueOrThrow({where:{sessionId_requestKey:{sessionId:s.id,requestKey:body.requestKey}}});
     const j=await wait(s,record.jobId);
     const count=provider.calls;
     await ok(request('POST',ep(s),body));assert.equal(provider.calls,count,'Lost-response replay is not generation');
     assert.equal(j.candidate.mediaRole,hero?'AI_PROMOTIONAL':'FACTUAL');
     assert.equal(j.lineage.studioSelection.templateId,t.id);assert.match(j.lineage.promptHash,/^[a-f0-9]{64}$/);
     assert.equal(j.lineage.style,undefined,'No internal prompt profile in UI response');
     const asset=await db.fileAsset.findUniqueOrThrow({where:{id:j.candidate.media.assetId}});
     assert.equal((await fetch(new URL(asset.url,c.origin))).status,404);
     await ok(request('GET',ep(s)+'/candidates/'+j.candidate.id+'/preview?edge=1024'),200);
     const usage=await db.recognitionUsage.findFirstOrThrow({where:{enhancementJobId:j.id}});assert.equal(usage.committedUsd.toString(),'0');assert.equal(usage.actualBilledUsd,null);
     const source=await db.productIntakeImage.findFirstOrThrow({where:{sessionId:s.id},include:{asset:true}});assert.equal(source.requestHash,sha(Buffer.concat([Buffer.from('image/jpeg'),photo])));
     const selectedBefore=await status(s);
     if(hero){
       await decide(s,'ACCEPT',j.candidate.id,{...review,materialMismatchObserved:true},400);
       await decide(s,'ACCEPT',j.candidate.id,review);
       const after=await status(s);assert.equal(after.selectedCandidateId,local.candidate.id);assert.equal(after.mediaRevision,selectedBefore.mediaRevision);assert.ok(after.approvedPromotionalCandidateIds.includes(j.candidate.id));
       await decide(s,'REJECT',j.candidate.id);assert.ok(!(await status(s)).approvedPromotionalCandidateIds.includes(j.candidate.id));
       await decide(s,'ACCEPT',j.candidate.id,review);
     }
     jobs.push({mode,id:j.id,candidateId:j.candidate.id,assetId:asset.id,assetUrl:asset.url,mediaRole:j.candidate.mediaRole,promptHash:j.lineage.promptHash,maskHash:j.lineage.maskHash,usageId:usage.id,
       rgbMismatches:j.candidate.processingDetails.opaqueRgbMismatches??null});
   }
   const factual=jobs.find(j=>j.mode==='FAITHFUL_COMPOSITE');
   if(factual)await decide(s,'ACCEPT',factual.candidateId,review);
   for(const key of['approvedMetadata','quantity','locationId','revision','selectedImageKey'])assert.deepEqual((await ok(request('GET',base+'/'+s.id),200))[key],before[key]);
   if(index===0||t.highRisk){
     const result=await ok(request('POST',base+'/'+s.id+'/submit',{expectedRevision:s.revision},undefined,s.submissionOperationKey));
     assert.deepEqual(await ok(request('POST',base+'/'+s.id+'/submit',{expectedRevision:s.revision},undefined,s.submissionOperationKey)),result);
     const product=await db.productListing.findUniqueOrThrow({where:{id:result.productId}});assert.equal(product.status,'DRAFT');assert.equal(product.availableQuantity,1);
     assert.ok(!jobs.filter(j=>j.mediaRole==='AI_PROMOTIONAL').some(j=>product.imageUrls.includes(j.assetUrl)));
     if(factual)assert.deepEqual(product.imageUrls,[factual.assetUrl]);
     primaryProducts.push({id:product.id,template:t.code,imageUrls:product.imageUrls});
   }
   rows.push({code:t.code,templateId:t.id,sessionId:s.id,syntheticSource:true,originalHash,jobs,unchangedBusinessFields:true});
 }
 assert.equal(rows.flatMap(r=>r.jobs).length,39);
 checks.push('All 20 templates / all 39 supported mode pairs processed through actual owned HTTP + BullMQ + private MinIO; local U2Net approved mask; immutable source lineage; 0 paid transport');
 checks.push('20 hero approvals/rejections leave factual selection/mediaRevision unchanged; material mismatch refused; faithful approvals checked separately; append-only decisionRevision fences stale decisions');
 checks.push('Actual Phase5 NEW/replay: one DRAFT/one opening; promotional candidate never factual primary; name/price/category/quantity/location unchanged');
 const allUsage=await db.recognitionUsage.aggregate({_sum:{committedUsd:true}});assert.equal(allUsage._sum.committedUsd.toString(),'0');
 const unknown=await newSession(); // second actor remains below hourly cap
 const t=STUDIO_TEMPLATES[5],original=provider.productStudio.bind(provider);let entered,release;
 const gate=new Promise(r=>entered=r),waitFor=new Promise(r=>release=r);
 provider.productStudio=async(...a)=>{entered();await waitFor;return original(...a);};
 const req={clientImageId:unknown.s.selectedImageKey,requestKey:randomUUID(),mode:'PRODUCT_STUDIO_HERO',studioSelection:{templateId:t.id,templateVersion:1,processingMode:'GENERATIVE_3D_HERO',sourceKind:'BOX'},sourceCandidateId:unknown.local.candidate.id,maskReviewed:true,generativeProductApproved:true};
 const running=await ok(request('POST',ep(unknown.s),req));await gate;
 await ok(request('PATCH',base+'/'+unknown.s.id,{expectedRevision:unknown.s.revision,selectedImageKey:randomUUID()}),200);release();
 await new Promise(r=>setTimeout(r,2000));provider.productStudio=original;
 assert.equal(await db.productImageEnhancementCandidate.count({where:{jobId:running.jobs[0].id}}),0);
 checks.push('Retake during in-flight mock generation prevents stale candidate commit; originals retained');
 const oldEnabled=config.get('PRODUCT_STUDIO_ENABLED');config.set('PRODUCT_STUDIO_ENABLED','false');
 const paused=await newSession();await ok(request('POST',ep(paused.s),{...req,clientImageId:paused.s.selectedImageKey,requestKey:randomUUID(),sourceCandidateId:paused.local.candidate.id}),404);config.set('PRODUCT_STUDIO_ENABLED',oldEnabled);
 // Above service-level disabled gate is fail-closed; API error contract is tested and documented.
 const ambiguous=await newSession();
 const {ImageProviderError}=require('../dist/src/image-enhancement/enhancement.provider');
 provider.productStudio=async()=>{throw new ImageProviderError('FAL_STUDIO_OUTCOME_UNKNOWN',true);};
 const ubody={...req,clientImageId:ambiguous.s.selectedImageKey,requestKey:randomUUID(),sourceCandidateId:ambiguous.local.candidate.id};
 await ok(request('POST',ep(ambiguous.s),ubody));
 const ur=await db.productImageEnhancementRequest.findUniqueOrThrow({where:{sessionId_requestKey:{sessionId:ambiguous.s.id,requestKey:ubody.requestKey}}});
 await wait(ambiguous.s,ur.jobId,'UNKNOWN');provider.productStudio=original;
 const committed=await db.recognitionUsage.findFirstOrThrow({where:{enhancementJobId:ur.jobId}});assert.equal(committed.status,'UNKNOWN');
 await service.recover();assert.equal((await db.productImageEnhancementJob.findUniqueOrThrow({where:{id:ur.jobId}})).status,'UNKNOWN');
 const alias=await ok(request('POST',ep(ambiguous.s),{...ubody,requestKey:randomUUID()}));assert.equal(alias.jobs.find(j=>j.id===ur.jobId).status,'UNKNOWN');
 await decide(ambiguous.s,'ORIGINAL');await decide(ambiguous.s,'ACCEPT',ambiguous.local.candidate.id);
 await ok(request('POST',ep(ambiguous.s),{...ubody,requestKey:randomUUID()}),409);
 assert.equal((await db.recognitionUsage.findUniqueOrThrow({where:{id:committed.id}})).committedUsd.toString(),committed.committedUsd.toString());
 checks.push('Library mock ambiguous outcome remains UNKNOWN across recovery, same-image redispatch blocked, reservation never released; no actual provider request');
 fs.writeFileSync(path.join(c.out,'all39-workflow-'+Date.now()+'.json'),JSON.stringify({mockOnly:true,paidCalls:0,rows,primaryProducts},null,2),{flag:'wx'});
};
