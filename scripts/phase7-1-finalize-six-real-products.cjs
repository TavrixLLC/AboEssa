if(process.env.REZONA_PHASE71_QA!=='1'||process.env.REZONA_REAL_PRODUCTS_FINALIZE!=='1')throw Error('User-approved QA finalization must be explicit');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const {session,folder}=require('./phase7-1-real-products-client.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const reviewed={
 1:{selected:'automatic',notes:'Full photographed TECLAST package retained; original sideways text orientation preserved. No storage/model specifications inferred.'},
 2:{selected:'clean',reject:['automatic','guided'],notes:'Isolation removes/fades package edges and the Y7 marking. Rejected both masks; neutral CLEAN keeps the complete captured package. Not successful background removal.'},
 3:{selected:'clean',reject:['automatic','guided'],notes:'Model isolates the printed receiver illustration, not the physical package. Rejected; full-photo CLEAN keeps the UGREEN identity and printed information.'},
 4:{selected:'clean',reject:['automatic','guided'],notes:'Model isolates only the sticker instead of the cutting board. Rejected; full-photo CLEAN preserves the actual board. Label orientation retained.'},
 5:{selected:'automatic',notes:'Full colored soap package and visible GUXIAOBEI/HANDMADE SOAP label retained.'},
 6:{selected:'guided',reject:['automatic'],notes:'Guided candidate retains visible jars, wheel, sphere, chains and frame. Minor gray residue/edge halo remains in the frame opening; owner review recommended. No pump/function/material claims.'},
};
(async()=>{const api=await session(),j=JSON.parse(await fs.readFile(path.join(folder,'intake-journal.json'),'utf8'));const save=()=>api.save('intake-journal.json',j);
 assert.equal(j.userApproved.quantityPerProduct,1);assert.equal(j.userApproved.pricesAndLocationDelegated,true);
 for(const p of j.products){
  if(sha(await fs.readFile(p.originalPath))!==p.originalSha256||sha(await fs.readFile(p.originalCopy))!==p.originalSha256)throw Error('Original photo integrity failure '+p.n);
  p.review=reviewed[p.n];const selected=p[p.review.selected];if(selected?.status!=='COMPLETED'||!selected.candidate)throw Error('Reviewed image unavailable '+p.n);
  p.selectedCandidateId=selected.candidate.id;p.reviewMethod='EXPLICIT_CODEX_VISUAL_REVIEW_ORIGINAL_VS_PRIVATE_1024_PREVIEW';await save();
  const base=`/admin/product-intake/sessions/${p.intakeId}`,endpoint=base+'/enhancements';
  let current=await api.request('GET',base);
  if(current.status==='DRAFT'){
   for(const [action,target]of [...(p.review.reject??[]).map(k=>['REJECT',p[k].candidate.id]),['ACCEPT',p.selectedCandidateId]]){
    p.decisions??=[];let d=p.decisions.find(d=>d.body.action===action&&d.body.candidateId===target);
    if(!d){const state=await api.request('GET',endpoint);d={body:{clientImageId:p.clientImageId,requestKey:randomUUID(),expectedRevision:current.revision,expectedMediaRevision:state.mediaRevision,action,candidateId:target,reviewed:true}};p.decisions.push(d);await save();}
    if(!d.acknowledged){const response=await api.request('POST',endpoint+'/decision',d.body);d.acknowledged=true;d.resultingMediaRevision=response.mediaRevision;await save();}
   }
  }
  let approved;
  for(let i=0;i<120;i++){const state=await api.request('GET',endpoint);assert.equal(state.selectedCandidateId,p.selectedCandidateId);approved=state.jobs.find(x=>x.candidate?.id===p.selectedCandidateId).candidate;if(approved.media?.optimization.status==='COMPLETED'&&approved.media.optimization.variantCount===8)break;await new Promise(r=>setTimeout(r,500));}
  assert.equal(approved.media.private,true);assert.equal(approved.media.optimization.status,'COMPLETED');assert.equal(approved.media.optimization.variantCount,8);p.approvedMedia=approved;
  const unique=new Set(approved.media.optimization.variants.map(v=>v.variantType+'/'+v.format));assert.equal(unique.size,8);
  current=await api.request('GET',base);
  if(current.status==='DRAFT'){
   assert.deepEqual(current.missingFields,[]);assert.equal(current.quantity,1);assert.equal(current.locationId,j.location.locationId);assert.equal(current.approvedMetadata.price,'10000');
   const duplicate=await api.request('GET',base+'/duplicates');p.preSubmitDuplicateReview=duplicate;await save();
   if(duplicate.needsReview||duplicate.candidates.some(x=>x.strong))throw Error('Matching existing product needs user review; stopped '+p.n);
   const r=await api.request('GET',base+'/recognition');assert.equal(r.state,'NOT_REQUESTED');p.recognition=r;
   p.submissionBody??={expectedRevision:current.revision};await save();
  }
  if(!p.submissionBody)throw Error('Missing durable Phase5 submission identity');
  const committed=await api.request('POST',base+'/submit',p.submissionBody,p.submissionOperationKey);
  const replay=await api.request('POST',base+'/submit',p.submissionBody,p.submissionOperationKey);assert.deepEqual(replay,committed);
  p.productId=committed.productId;p.submission=committed;p.submissionReplayedExactly=true;await save();
  const product=await api.request('GET','/admin/products/'+p.productId),inventory=await api.request('GET','/admin/products/'+p.productId+'/inventory'),movements=await api.all('/admin/products/'+p.productId+'/inventory/movements');
  assert.equal(product.title,p.title);assert.equal(product.categoryId,p.categoryId);assert.equal(product.status,'DRAFT');assert.equal(product.totalQuantity,1);assert.equal(product.availableQuantity,1);assert.equal(product.soldQuantity,0);assert.equal(Number(product.price),10000);assert.equal(product.imageUrls.length,1);
  assert.equal(inventory.reconciliation.state,'MATCHED');assert.equal(inventory.totals.quantityOnHand,1);assert.equal(inventory.totals.quantityReserved,0);
  const nonzero=inventory.balances.filter(b=>b.quantityOnHand||b.quantityReserved);assert.equal(nonzero.length,1);assert.equal(nonzero[0].locationId,j.location.locationId);assert.equal(nonzero[0].quantityOnHand,1);assert.equal(nonzero[0].location.warehouseId,j.location.warehouseId);
  assert.equal(movements.length,1);assert.equal(movements[0].movementType,'OPENING_BALANCE');assert.equal(movements[0].quantityDelta,1);
  const state=await api.request('GET',endpoint),candidate=state.jobs.find(x=>x.candidate?.id===p.selectedCandidateId).candidate;assert.equal(candidate.media.associatedProductId,product.id);assert.equal(candidate.media.optimization.variantCount,8);
  p.finalVerification={time:new Date().toISOString(),product,inventory,movements,approvedMedia:candidate,privateUnauthenticatedStatus:(await fetch(api.origin+new URL(product.imageUrls[0],api.origin).pathname)).status};
  assert.equal(p.finalVerification.privateUnauthenticatedStatus,404);
  const preview=await api.request('GET',`${endpoint}/candidates/${p.selectedCandidateId}/preview?edge=1024`);await fs.writeFile(path.join(folder,`${String(p.n).padStart(2,'0')}-approved.webp`),Buffer.from(preview.base64,'base64'));
  const unauthorized=await fetch(api.origin+'/api'+endpoint);assert.equal(unauthorized.status,401);
  await save();console.log(JSON.stringify({n:p.n,id:product.id,name:product.title,category:product.categoryName,status:product.status,quantity:product.availableQuantity,location:j.location.warehouseCode+'/'+j.location.code,media:p.review.selected,variants:candidate.media.optimization.variantCount,stockReconciled:inventory.reconciliation.state}));
 }
 j.catalogAfter=await api.all('/admin/products');j.completedAt=new Date().toISOString();j.createdProductCount=j.products.filter(p=>p.productId).length;await save();
 console.log(JSON.stringify({created:j.createdProductCount,status:'DRAFT',publicPublishingCalls:0,recognitionCalls:0,variantsVerified:j.products.reduce((n,p)=>n+p.approvedMedia.media.optimization.variantCount,0)}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
