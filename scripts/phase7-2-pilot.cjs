// Six local-only photographs. Never submits stock or changes their existing QA listings.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp'),assert=require('node:assert/strict'),{createHash,randomUUID}=require('node:crypto');
const sha=b=>createHash('sha256').update(b).digest('hex');
module.exports=async c=>{
 const journal=JSON.parse(fs.readFileSync('D:/rezona-phase7-1-qa/real-products-20261121/intake-journal.json','utf8'));
 const dir=path.join(c.qa,'pilot-'+randomUUID().slice(0,8));fs.mkdirSync(dir);const rows=[];
 const h=await require('./phase7-2-checks.cjs').helpers(c),{ok,draft,start,wait,decide,ep}=h;
 const {STORAGE_PROVIDER}=require('../dist/src/files/storage-provider.interface');const storage=c.app.get(STORAGE_PROVIDER);
 const {ImageEditingProvider}=require('../dist/src/image-enhancement/enhancement.provider');const provider=c.app.get(ImageEditingProvider);
 const originalStudio=provider.studio.bind(provider);let prefix;
 provider.studio=async(png,...args)=>{fs.writeFileSync(path.join(dir,prefix+'-prepared-reference.png'),png,{flag:'wx'});
   const out=await originalStudio(png,...args);fs.writeFileSync(path.join(dir,prefix+'-mock-plate.png'),out.bytes,{flag:'wx'});return out;};
 const save=(name,bytes)=>{fs.writeFileSync(path.join(dir,name),bytes,{flag:'wx'});};
 async function object(assetId){const asset=await c.db.fileAsset.findUniqueOrThrow({where:{id:assetId}});assert.equal(asset.intakePrivate,true);assert.equal(asset.intakeProductId,null);
   const r=await storage.getObject(asset.key),parts=[];for await(const b of r.stream)parts.push(b);return Buffer.concat(parts);}
 async function candidateFiles(n,job,label){const row=await c.db.productImageEnhancementCandidate.findUniqueOrThrow({where:{id:job.candidate.id}});
   const bytes=await object(row.assetId);save(`${n}-${label}.webp`,await sharp(bytes).webp({lossless:true}).toBuffer());
   if(row.maskAssetId)save(`${n}-${label}-mask.png`,await object(row.maskAssetId));return bytes;}
 try{for(const old of journal.products){
   const n=String(old.n).padStart(2,'0'),bytes=fs.readFileSync(old.originalPath);assert.equal(sha(bytes),old.originalSha256);save(n+'-original.jpeg',bytes);
   const s=await draft(bytes,'NEW',undefined,false),begin=Date.now(),a=await start(s,'NEURAL_BACKGROUND_REMOVE'),automatic=await wait(s,a.jobs[0].id);
   let chosen=automatic,b=await candidateFiles(n,automatic,'automatic'),guided;
   if(old.foregroundRegion){const r=await start(s,'NEURAL_BACKGROUND_REMOVE',{foregroundRegion:old.foregroundRegion});guided=await wait(s,r.jobs[0].id);b=await candidateFiles(n,guided,'guided');chosen=guided;}
   const r={n:old.n,title:old.title,sourceHash:old.originalSha256,intakeId:s.id,automatic:automatic.id,guided:guided?.id,
     localCandidateId:chosen.candidate.id,maskHash:chosen.candidate.processingDetails.maskHash,
     maskDecision:'NOT_APPROVED_FOR_STYLING',styledStatus:'BLOCKED_MASK_REVIEW',stylingEmployeeDecision:'PENDING_OWNER_REVIEW',
     liveGemini:'NOT_RUN',actualCostUsd:null,employeePreference:'NOT_MEASURED',localPipelineMs:Date.now()-begin};
   let styledBytes;
   // Only exact reproductions of the two previously accepted COMPLETE package masks.
   if([1,5].includes(old.n) && chosen.candidate.contentHash===old.approvedMedia.contentHash){
     await ok(decide(s,'ACCEPT',chosen.candidate.id));r.maskDecision='QA_REPLAY_OF_PREVIOUSLY_REVIEWED_IDENTICAL_COMPLETE_MASK';
     prefix=n;const t=Date.now(),q0=await start(s,'GEMINI_BRAND_STUDIO',{sourceCandidateId:chosen.candidate.id,maskReviewed:true}),q=await wait(s,q0.jobs[0].id);
     styledBytes=await candidateFiles(n,q,'styled-mock');r.styledStatus='MOCK_CANDIDATE_REQUIRES_EMPLOYEE_REVIEW';r.styledCandidateId=q.candidate.id;r.mockPipelineMs=Date.now()-t;
     r.styledContentHash=q.candidate.contentHash;r.foregroundHash=q.candidate.processingDetails.foregroundHash;
   }else{
     await ok(decide(s,'REJECT',chosen.candidate.id));
     r.blockReason=old.n===6?'Residual chair/background in frame opening: stricter brand-styling source review not approved':
       [2,3,4].includes(old.n)?old.review.notes:'Mask reproduction differs: requires fresh human review';
     const denied=await c.request('POST',ep(s),{clientImageId:s.selectedImageKey,requestKey:randomUUID(),mode:'GEMINI_BRAND_STUDIO',sourceCandidateId:chosen.candidate.id,maskReviewed:true});
     assert.equal(denied.status,409);r.serverBlocked=true;
   }
   const label=(text,color='#eee')=>Buffer.from(`<svg width="600" height="80"><rect width="600" height="80" fill="#151919"/><text x="24" y="45" font-family="Arial" font-size="22" fill="${color}">${text}</text></svg>`);
   const panel=async image=>sharp(image).resize(580,600,{fit:'contain',background:'#F8F6F1'}).jpeg().toBuffer();
   const blocked=Buffer.from('<svg width="580" height="600"><rect width="580" height="600" fill="#151919"/><text x="290" y="270" text-anchor="middle" font-family="Arial" font-size="24" fill="#E7BC61">BLOCKED: MASK NEEDS REVIEW</text><text x="290" y="315" text-anchor="middle" font-family="Arial" font-size="20" fill="white">No Gemini request or styled result</text></svg>');
   const board=await sharp({create:{width:1800,height:760,channels:3,background:'#0C0F0F'}}).composite([
     {input:label('A. Untouched original'),left:0,top:0},{input:label('B. Local mask: review required'),left:600,top:0},
     {input:label(styledBytes?'C. MOCK ONLY - not Gemini quality':'C. Blocked - no generated result','#E7BC61'),left:1200,top:0},
     {input:await panel(bytes),left:10,top:90},{input:await panel(b),left:610,top:90},{input:styledBytes?await panel(styledBytes):blocked,left:1210,top:90},
     {input:Buffer.from(`<svg width="1800" height="60"><text x="20" y="35" font-family="Arial" font-size="22" fill="#E7BC61">PRIVATE QA / Image ${n} / No live AI / No publication / Owner review pending</text></svg>`),left:0,top:700},
   ]).jpeg({quality:92}).toBuffer();save(n+'-comparison.jpg',board);r.board=path.join(dir,n+'-comparison.jpg');
   assert.equal((await c.db.productIntakeSession.findUniqueOrThrow({where:{id:s.id}})).status,'DRAFT');
   assert.equal((await c.db.productIntakeSession.findUniqueOrThrow({where:{id:s.id}})).completedProductId,null);
   rows.push(r);console.log(JSON.stringify({n:old.n,status:r.styledStatus}));
 }}finally{provider.studio=originalStudio;}
 const html='<!doctype html><meta charset="utf-8"><title>REZONA private Phase72 comparisons</title><body style="background:#0C0F0F;color:#F8F6F1;font-family:Arial"><h1>PRIVATE QA — mock only; no live Gemini evaluation</h1><p dir="rtl">النتائج محلية فقط. المنتجات الأصلية لم تتغير؛ اعتماد تنسيق الصور والنشر يحتاج موافقتك.</p>'+rows.map(r=>`<section><h2>${r.n}. ${r.title}</h2><p>${r.blockReason??r.styledStatus}</p><img style="width:100%" src="${String(r.n).padStart(2,'0')}-comparison.jpg"></section>`).join('');
 save('review.html',Buffer.from(html));save('pilot.json',Buffer.from(JSON.stringify({scope:'Local authorized photos, deterministic mock background, original six products not touched',dir,rows},null,2)));
 fs.writeFileSync(path.join(c.out,'six-photo-pilot-'+Date.now()+'.json'),JSON.stringify({privateFolder:dir,rows,liveCalls:0,productsCreated:0,paidCalls:0,passed:true},null,2),{flag:'wx'});
 c.checks.push('Six originals verified byte-identical; six separate private QA evaluation drafts; real local U2Net automatic/guided masks retained');
 c.checks.push('Only two exact complete-package mask reproductions enter mock styling; four remain blocked; no new stock/listing or final image acceptance');
 c.checks.push('Six private A/B/C comparison boards; blocked panels are not generated results; real Gemini cost/quality/preference not measured');
};
