// Offline boards + read-only isolated QA audit. NO inference or account/billing requests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),base='D:/rezona-premium-3d-qa',m=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8')),r=JSON.parse(fs.readFileSync(path.join(m.dir,'pilot-result.json'),'utf8')),mode=process.argv[2],manifest=path.join(base,'review-manifest.json');
global.fetch=()=>{throw Error('PREMIUM_3D_REVIEW_NO_NETWORK');};
const sha=b=>createHash('sha256').update(b).digest('hex'),write=(d,n,v)=>fs.writeFileSync(path.join(d,n),Buffer.isBuffer(v)||typeof v==='string'?v:JSON.stringify(v,null,2),{flag:'wx'});
(async()=>{
 if(mode==='visual'){
  assert.ok(!fs.existsSync(manifest));const id='20261123-'+randomUUID().slice(0,8),dir=path.join(base,'review-'+id);fs.mkdirSync(dir);
  const original=fs.readFileSync(path.join(m.dir,'original.jpeg')),ai=fs.readFileSync(path.join(m.dir,'premium-3d-result.png'));
  assert.equal(sha(original),m.photo.originalSha256);assert.equal(sha(fs.readFileSync(path.join(m.dir,'approved-mask.png'))),m.photo.maskHash);
  const specs=[['original-brand',original,{left:550,top:270,width:240,height:340}],['generated-brand',ai,{left:590,top:180,width:184,height:250}],['original-barcode',original,{left:128,top:148,width:85,height:255}],['generated-barcode',ai,{left:255,top:85,width:65,height:252}]];
  const layers=[],label=t=>Buffer.from(`<svg width="640" height="70"><rect width="640" height="70" fill="#111315"/><text x="14" y="42" font-size="21" font-family="Arial" fill="#E7BC61">${t}</text></svg>`);
  for(let i=0;i<specs.length;i++){
   const[name,bytes,roi]=specs[i],crop=await sharp(bytes).extract(roi).rotate(270).png().toBuffer();write(dir,name+'.png',crop);
   const left=(i%2)*640,top=Math.floor(i/2)*560;
   layers.push({input:label((i%2?'AI GENERATED - verify':'ORIGINAL - reference')+(i>1?' / BARCODE':' / BRAND')),left,top},{input:await sharp(crop).resize(620,450,{fit:'contain',background:'#EEEDE8',kernel:'nearest'}).png().toBuffer(),left:left+10,top:top+85});
  }
  write(dir,'identity-inspection.jpg',await sharp({create:{width:1280,height:1120,channels:3,background:'#111315'}}).composite(layers).jpeg({quality:97}).toBuffer());
  const review={id,dir,run:m.id,newPaidRequests:0,employeeApproval:'PENDING'};write(base,path.basename(manifest),review);write(m.out,'review-manifest.json',review);
  console.log(JSON.stringify({reviewDir:dir,inspection:path.join(dir,'identity-inspection.jpg'),paidCalls:0}));return;
 }
 const v=JSON.parse(fs.readFileSync(manifest,'utf8'));
 if(mode==='render-proof'){
  const raw=await sharp(fs.readFileSync(path.join(m.dir,'raw-fal-3d.png'))).toColourspace('srgb').ensureAlpha().raw().toBuffer(),final=await sharp(fs.readFileSync(path.join(m.dir,'premium-3d-result.png'))).toColourspace('srgb').ensureAlpha().raw().toBuffer();
  assert.ok(raw.equals(final));
  process.env.NODE_PATH=m.dist+path.delimiter+path.join(root,'node_modules');require('node:module').Module._initPaths();
  const a=require(path.join(m.dist,'src/image-enhancement/brand-studio.config.js')).TABLETOP_STYLES;
  const previous=JSON.parse(fs.readFileSync('D:/rezona-phase7-3-1-qa/local-manifest.json','utf8'));
  const b=require(path.join(previous.dist,'src/image-enhancement/brand-studio.config.js')).TABLETOP_STYLES;assert.equal(JSON.stringify(a),JSON.stringify(b));
  const proof={all1048576GeneratedRgbaPixelsRetained:true,generatedRawRgbaSha256:sha(raw),finalMasterRgbaSha256:sha(final),originalForegroundOverlaid:false,previousThreeTabletopProfilesUnchanged:true,newProviderCalls:0};
  write(v.dir,'render-policy-proof.json',proof);write(m.out,'render-policy-proof.json',proof);console.log(JSON.stringify(proof));return;
 }
 if(mode==='detail'){
  write(v.dir,'generated-barcode-upright-INSPECTION.png',await sharp(fs.readFileSync(path.join(v.dir,'generated-barcode.png'))).rotate(180).resize({width:1260,kernel:'nearest'}).png().toBuffer());
  console.log(JSON.stringify({file:path.join(v.dir,'generated-barcode-upright-INSPECTION.png'),paidCalls:0}));return;
 }
 if(mode==='audit'){
  const{PrismaClient,Prisma}=require('@prisma/client'),cfg=JSON.parse(fs.readFileSync('D:/rezona-phase7-2-qa/20261122-6470081b/runtime-secrets.json','utf8'));
  const db=new PrismaClient({datasources:{db:{url:`postgresql://phase72_qa:${encodeURIComponent(cfg.postgresPassword)}@127.0.0.1:55454/${m.db}`}},log:[]});let audit;
  try{audit=await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const jobs=await tx.productImageEnhancementJob.findMany({where:{provider:'fal'},include:{candidate:{include:{asset:true}}}}),u=await tx.recognitionUsage.findMany({select:{status:true,committedUsd:true,reservedUsd:true,estimatedUsd:true,actualBilledUsd:true}});
   assert.equal(jobs.length,1);assert.equal(u.length,1);const j=jobs[0];assert.equal(j.mode,'PREMIUM_3D_STUDIO');assert.equal(j.generation,0);assert.equal(j.status,'COMPLETED');assert.equal(j.providerRequestId,r.row.requestId);
   assert.ok(j.candidate.asset.intakePrivate);assert.equal(j.candidate.asset.intakeProductId,null);assert.equal(j.candidate.qualityStatus,'REVIEW_REQUIRED');
   assert.equal(await tx.productImageEnhancementDecision.count({where:{selectedCandidateId:j.candidate.id}}),0);
   assert.ok(u[0].committedUsd.eq('.17408'));assert.equal(u[0].actualBilledUsd,null);
   const counts={};for(const model of['productListing','customer','customerWallet','walletEntry','order','auction','inventoryBalance','inventoryMovement','inventoryAllocation','warehouse','warehouseLocation']){counts[model]=await tx[model].count();assert.equal(counts[model],0);}
   const drafts=await tx.productIntakeSession.findMany({select:{status:true,quantity:true,locationId:true,completedProductId:true}});assert.ok(drafts.every(d=>d.status==='DRAFT'&&d.quantity===null&&d.locationId===null&&d.completedProductId===null));
   return{jobId:j.id,candidateId:j.candidate.id,providerRequestId:j.providerRequestId,mode:j.mode,promptVersion:j.promptVersion,recipeVersion:j.recipeVersion,processingDetails:j.candidate.processingDetails,usage:u,counts,drafts,privateCandidate:true,candidateSelected:false,strictReviewGate:r.row.strictReviewGateVerified};
  });}finally{await db.$disconnect();}
  for(const h of m.baseline)assert.equal(sha(fs.readFileSync(h.file)),h.sha256);
  const marker=JSON.parse(fs.readFileSync(path.join(base,m.approvalId+'-one-attempt.json'),'utf8'));assert.equal(marker.style,'REZONA_STYLE_3D_BLACK_GOLD_V1');
  const proof={at:new Date().toISOString(),audit,realRequests:r.realRequests,regenerations:0,priorCommitmentsUsd:'0.870400',newCommitmentUsd:'0.174080',aggregateCommitmentUsd:'1.044480',newEstimatedUsd:r.row.billing.estimatedChargedUsd,newActualBilledUsd:null,historicalTotalActualUsd:null,priorFilesUnchanged:true,reviewNetworkCalls:0};
  write(v.dir,'readonly-audit.json',proof);write(m.out,'readonly-final-audit.json',proof);console.log(JSON.stringify({audited:true,requests:1,pendingApproval:true,estimatedUsd:r.row.billing.estimatedChargedUsd,actualUsd:'UNKNOWN',newPaidCalls:0}));return;
 }
 if(mode==='seal'){
  for(const h of m.baseline)assert.equal(sha(fs.readFileSync(h.file)),h.sha256);
  const report=fs.readFileSync(path.join(root,'docs/rezona-premium-3d-black-gold.md'));write(v.dir,'implementation-report.md',report);
  const key=require('dotenv').parse(fs.readFileSync('D:/rezona-phase7-2-qa/fal-pilot/backend.env')).FAL_KEY.trim(),records=[];
  const files=['.gitignore','.env.premium-3d.example','src/image-enhancement/premium-3d.config.ts','src/image-enhancement/premium-3d-codec.ts','src/image-enhancement/brand-studio.config.ts','src/image-enhancement/enhancement.config.ts','src/image-enhancement/enhancement-codec.ts','src/image-enhancement/enhancement.provider.ts','src/image-enhancement/enhancement.service.ts','src/image-enhancement/fal-studio.config.ts','src/image-enhancement/fal-studio.provider.ts','src/ai/recognition-budget.service.ts','src/product-intake/intake-enhancement.controller.ts','prisma/migrations/20261123000100_premium_3d_styling/migration.sql','tests/unit/premium-3d.spec.ts','scripts/premium-3d-pilot.cjs','scripts/premium-3d-review.cjs','docs/rezona-premium-3d-black-gold.md'];
  const mobile=path.resolve(root,'../AboEssaMobile/apps/admin_app'),mobileFiles=['lib/features/product_intake/intake_repository.dart','lib/features/product_intake/intake_enhancement_card.dart','test/intake_premium_3d_test.dart'];
  for(const[d,list]of[[root,files],[mobile,mobileFiles],[m.out,fs.readdirSync(m.out)],[m.dir,fs.readdirSync(m.dir).filter(n=>n!=='dist'&&n!=='private-admin.json')],[v.dir,fs.readdirSync(v.dir)]])for(const n of list){const file=path.join(d,n);if(!fs.statSync(file).isFile())continue;const b=fs.readFileSync(file);assert.ok(!b.includes(Buffer.from(key)));records.push({file,bytes:b.length,sha256:sha(b)});}
  write(m.out,'evidence-final.json',{at:new Date().toISOString(),records,actualKeyValueFound:false,realRequests:1,regenerations:0,noDeployment:true,noGithubPush:true,originalsAndMasksUnchanged:true,employeeApproval:'PENDING'});
  console.log(JSON.stringify({sealed:true,records:records.length,paidRequests:1,review:path.join(v.dir,'review.html')}));return;
 }
 throw Error('INVALID_REVIEW_MODE');
})().catch(e=>{console.error(/^[A-Z0-9_]{1,100}$/.test(e?.message??'')?e.message:'PREMIUM_3D_REVIEW_REQUIRES_ATTENTION');process.exitCode=1;});
