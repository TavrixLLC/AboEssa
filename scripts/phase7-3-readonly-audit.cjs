// Read-only pilot/budget/identity audit. No inference calls, selection, publication or writes to DB.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),m=JSON.parse(fs.readFileSync('D:/rezona-phase7-3-qa/pilot-manifest.json','utf8'));
const latest=fs.existsSync(path.join(m.dir,'pilot-result-continuation.json'))?'pilot-result-continuation.json':'pilot-result.json',result=JSON.parse(fs.readFileSync(path.join(m.dir,latest),'utf8'));
const cfg=JSON.parse(fs.readFileSync('D:/rezona-phase7-2-qa/20261122-6470081b/runtime-secrets.json','utf8'));
const {PrismaClient,Prisma}=require('@prisma/client'),sharp=require('sharp'),sha=b=>createHash('sha256').update(b).digest('hex');
const{FAL_KEY}=require('dotenv').parse(fs.readFileSync('D:/rezona-phase7-2-qa/fal-pilot/backend.env'));
process.env.NODE_PATH=m.dist+path.delimiter+path.join(root,'node_modules');require('node:module').Module._initPaths();
const{TABLETOP_STYLES,CATALOG_STUDIO_V1}=require(path.join(m.dist,'src/image-enhancement/brand-studio.config.js'));
const{studioCodec}=require(path.join(m.dist,'src/image-enhancement/brand-studio-codec.js'));
const client=db=>new PrismaClient({datasources:{db:{url:`postgresql://phase72_qa:${encodeURIComponent(cfg.postgresPassword)}@127.0.0.1:55454/${db}`}},log:[]});
async function queryMetadata(row){
 const u=new URL('https://api.fal.ai/v1/models/requests/by-endpoint');u.searchParams.set('endpoint_id',m.primaryModel);u.searchParams.set('limit','10');
 if(row.requestId)u.searchParams.set('request_id',row.requestId);else{u.searchParams.set('start',new Date(Date.parse(row.requestTimestamp)-1000).toISOString());u.searchParams.set('end',new Date(Date.parse(row.requestTimestamp)+60000).toISOString());}
 try{const r=await fetch(u,{method:'GET',redirect:'error',headers:{authorization:'Key '+FAL_KEY.trim()},signal:AbortSignal.timeout(15000)});
  if(!r.ok){await r.body?.cancel();return{httpStatus:r.status};}const data=await r.json();
  return{httpStatus:r.status,correlation:row.requestId?'EXACT_CAPTURED_RESPONSE_ID':'PROVISIONAL_WINDOW_ONLY',items:(data.items??[]).filter(i=>i.endpoint_id===m.primaryModel).map(i=>({requestId:i.request_id,status:i.status_code,sentAt:i.sent_at,startedAt:i.started_at,endedAt:i.ended_at,duration:i.duration}))};
 }catch{return{state:'METADATA_UNAVAILABLE'};}
}
(async()=>{
 const proofs=[];
 for(const row of result.rows){
  const p=m.photos.find(p=>p.n===row.n),source=fs.readFileSync(path.join(m.dir,row.prefix+'-original.jpeg')),mask=fs.readFileSync(path.join(m.dir,row.prefix+'-mask.png'));
  assert.equal(sha(source),p.originalSha256);assert.equal(sha(mask),p.maskHash);
  const neutral=await studioCodec({bytes:source,mime:'image/jpeg',mask,mode:'GEMINI_BRAND_STUDIO',background:'WHITE',matting:false,studioProfile:CATALOG_STUDIO_V1});assert.equal(neutral.details.foregroundHash,row.foregroundHash);
  let opaquePixels=0,mismatchPixels=null;
  if(row.candidateId){const fg=await sharp(neutral.foreground).ensureAlpha().raw().toBuffer(),final=await sharp(fs.readFileSync(path.join(m.dir,row.prefix+'-final.png'))).ensureAlpha().raw().toBuffer();mismatchPixels=0;
   for(let i=0;i<fg.length;i+=4)if(fg[i+3]===255){opaquePixels++;if(fg[i]!==final[i]||fg[i+1]!==final[i+1]||fg[i+2]!==final[i+2])mismatchPixels++;}assert.equal(mismatchPixels,0);
  }
  proofs.push({n:row.n,preset:row.preset,originalUnchanged:true,approvedMaskUnchanged:true,foregroundHash:row.foregroundHash,opaquePixelsCompared:opaquePixels,opaqueRgbMismatches:mismatchPixels,semiTransparentEdges:'Same captured RGBA foreground; background naturally influences blended edge pixels',metadata:await queryMetadata(row)});
 }
 const db=client(m.db),oldDb=client('rezona_phase72_fal_84a2de4a');let state,prior;
 try{
  state=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   const counts={};for(const model of ['productListing','customer','customerWallet','walletEntry','order','auction','inventoryBalance','inventoryMovement','inventoryAllocation','warehouse','warehouseLocation']){counts[model]=await tx[model].count();assert.equal(counts[model],0);}
   const sessions=await tx.productIntakeSession.findMany({select:{id:true,status:true,quantity:true,locationId:true,completedProductId:true}});assert.ok(sessions.every(s=>s.status==='DRAFT'&&s.quantity===null&&s.locationId===null&&s.completedProductId===null));
   const usage=await tx.recognitionUsage.findMany({select:{status:true,committedUsd:true,reservedUsd:true,estimatedUsd:true,actualBilledUsd:true}});assert.equal(usage.length,result.realRequests);assert.ok(usage.every(u=>u.committedUsd.eq('.17408')&&u.actualBilledUsd===null));
   assert.equal(await tx.fileAsset.count({where:{OR:[{intakePrivate:false},{intakeProductId:{not:null}}]}}),0);
   for(const r of result.rows.filter(r=>r.candidateId))assert.equal(await tx.productImageEnhancementDecision.count({where:{selectedCandidateId:r.candidateId}}),0);
   return{counts,sessions,usage,allAssetsPrivate:true,noStyledCandidateAccepted:true,totalCommittedUsd:usage.reduce((s,u)=>s.add(u.committedUsd),new Prisma.Decimal(0)).toString()};
  });
  prior=await oldDb.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const u=await tx.recognitionUsage.findMany({select:{status:true,committedUsd:true,actualBilledUsd:true}});assert.equal(u.reduce((s,r)=>s.add(r.committedUsd),new Prisma.Decimal(0)).toString(),'0.34816');assert.equal(u.filter(r=>r.status==='UNKNOWN').length,1);return{usage:u,totalCommittedUsd:'0.348160',unknownReleased:false};});
 }finally{await db.$disconnect();await oldDb.$disconnect();}
 const value={auditedAt:new Date().toISOString(),prior,state,proofs,newInferenceCalls:0,actualTotalChargeUsd:null,
  reportedEstimatedKnownSubtotalUsd:result.rows.reduce((s,r)=>s.add(r.billing?.estimatedChargedUsd??0),new Prisma.Decimal(0)).toString(),
  policy:'No inferred zero for unknown request. Reservations are not charges. No old reservation released.',presets:TABLETOP_STYLES.map(s=>({id:s.profile.name,label:s.label,profile:s.profile}))};
 const name='readonly-audit-'+Date.now()+'.json';for(const d of [m.dir,m.out])fs.writeFileSync(path.join(d,name),JSON.stringify(value,null,2),{flag:'wx'});
 console.log(JSON.stringify({passed:true,file:name,proofs:proofs.map(p=>({n:p.n,preset:p.preset,opaquePixels:p.opaquePixelsCompared,mismatches:p.opaqueRgbMismatches})),priorCommitment:prior.totalCommittedUsd,newCommitment:state.totalCommittedUsd,estimatedKnownSubtotal:value.reportedEstimatedKnownSubtotalUsd,newPaidCalls:0}));
})().catch(()=>{console.error('TABLETOP_READONLY_AUDIT_REQUIRES_REVIEW');process.exitCode=1;});
