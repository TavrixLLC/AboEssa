// Synthetic capacity workload, only on the new internal Phase91 local network.
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const {PrismaClient}=require('@prisma/client'),argon=require('argon2'),sharp=require('sharp');
const {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand,DeleteObjectCommand,ListObjectsV2Command,CreateBucketCommand}=require('@aws-sdk/client-s3');
assert.equal(process.env.P91_SYNTHETIC_ONLY,'true');
const db=new PrismaClient(),base='http://api:3000',password=randomBytes(24).toString('base64url')+'Aa1!';
const sha=b=>createHash('sha256').update(b).digest('hex');
const s3=key=>new S3Client({endpoint:'http://silo:9000',region:'us-east-1',forcePathStyle:true,maxAttempts:1,
 credentials:{accessKeyId:process.env['P91_'+key+'_ACCESS'],secretAccessKey:process.env['P91_'+key+'_SECRET']}});
const apiS3=s3('APP'),wrong=s3('DENIED'),operator=s3('ROOT');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const out={syntheticOnly:true,realCustomerData:false,paidCalls:0,images:[],checks:[],workerConcurrency:1,automaticAcceptance:false};
let token;
async function req(method,url,body,expected=200,auth=true){const at=Date.now();const r=await fetch(base+url,{method,
 headers:{...(body instanceof FormData?{}:{'content-type':'application/json'}),...(auth?{authorization:'Bearer '+token}:{})},
 body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
 const data=await r.json();assert.equal(r.status,expected,JSON.stringify({method,url,status:r.status,code:data.error?.code||data.message}));
 return{data:data.data??data,ms:Date.now()-at};}
async function ready(){for(let i=0;i<60;i++){try{if((await fetch(base+'/ready')).ok)return;}catch{}await wait(1000);}throw Error('LOCAL_API_NOT_READY');}
async function main(){
 await ready();assert.equal(await db.customer.count(),0);assert.equal(await db.order.count(),0);
 const email='envelope-'+randomUUID()+'@example.invalid';
 await db.adminUser.create({data:{email,normalizedEmail:email,name:'Synthetic resource-envelope operator',passwordHash:await argon.hash(password),role:'OWNER',isOwner:true}});
 token=(await req('POST','/api/admin/auth/login',{email,password},201,false)).data.accessToken;assert.ok(token);
 await req('GET','/api/admin/console/overview',undefined,401,false);
 await req('GET','/api/admin/product-intake/studio-review',undefined,404);
 const fixture=Buffer.from('PHASE91_SYNTHETIC_S3_TEST');const key='capacity/permissions-'+randomUUID();
 await apiS3.send(new PutObjectCommand({Bucket:'aboessa-media',Key:key,Body:fixture,ContentType:'application/octet-stream'}));
 assert.equal((await apiS3.send(new HeadObjectCommand({Bucket:'aboessa-media',Key:key}))).ContentLength,fixture.length);
 assert.equal(sha(Buffer.from(await (await apiS3.send(new GetObjectCommand({Bucket:'aboessa-media',Key:key}))).Body.transformToByteArray())),sha(fixture));
 let denied=0;
 for(const [client,bucket]of[[wrong,'aboessa-media'],[apiS3,'wrong-bucket']])try{await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:fixture}));throw Error('IAM_BOUNDARY_FAILED');}catch(e){assert.equal(e.$metadata?.httpStatusCode,403);denied++;}
 const anonymous=await fetch('http://silo:9000/aboessa-media/'+key);assert.ok([401,403].includes(anonymous.status));await anonymous.body?.cancel();
 await apiS3.send(new DeleteObjectCommand({Bucket:'aboessa-media',Key:key}));
 out.checks.push({s3RestrictedPutGetHeadDelete:true,wrongPrincipal403:true,wrongBucket403:true,anonymousDenied:true,policyAdminPowersNotTested:true});
 for(let i=0;i<3;i++){
  // 12MP valid JPEG sources exercise maximum configured pixel count. These are
  // deliberately synthetic patterns, not photo/text/segmentation-quality evidence.
  const source=await sharp({create:{width:4000,height:3000,channels:3,background:i%2?'#e4b056':'#cedde0'}})
   .composite([{input:Buffer.from('<svg width="4000" height="3000"><rect x="500" y="400" width="2700" height="2000" fill="#283d42"/><circle cx="2000" cy="1300" r="600" fill="#d8b15b"/></svg>')}]).jpeg({quality:88}).toBuffer();
  assert.ok(source.length<5*1024*1024);
  let session=(await req('POST','/api/admin/product-intake/sessions',{clientDraftId:randomUUID(),submissionOperationKey:randomUUID()},201)).data;
  const imageId=randomUUID();session=(await req('PATCH','/api/admin/product-intake/sessions/'+session.id,{expectedRevision:session.revision,selectedImageKey:imageId})).data;
  const form=new FormData();form.set('clientImageId',imageId);form.set('file',new Blob([source],{type:'image/jpeg'}),'synthetic-capacity.jpg');
  const upload=await req('POST','/api/admin/product-intake/sessions/'+session.id+'/image',form,201);session=upload.data;
  const sourceRow=await db.productIntakeImage.findUnique({where:{sessionId_clientImageId:{sessionId:session.id,clientImageId:imageId}},include:{asset:true}});assert.ok(sourceRow?.asset);
  const templates=(await req('GET','/api/admin/product-intake/sessions/'+session.id+'/enhancements/studio/templates')).data;
  assert.equal(templates.templates.length,20);assert.equal(templates.cost.generationEnabled,false);assert.ok(templates.templates.every(t=>t.generationAllowedModes.length===0));
  const jobAt=Date.now();await req('POST','/api/admin/product-intake/sessions/'+session.id+'/enhancements',{clientImageId:imageId,requestKey:randomUUID(),mode:'CLEAN'},201);
  let job;
  for(let j=0;j<120;j++){
   const st=(await req('GET','/api/admin/product-intake/sessions/'+session.id+'/enhancements')).data;
   job=st.jobs[0];if(job?.status==='COMPLETED')break;
   if(['FAILED','UNKNOWN','CANCELLED'].includes(job?.status))throw Error('LOCAL_CLEAN_'+job.status+'_'+(job.errorCode||'UNKNOWN'));
   await wait(500);
  }
  assert.equal(job?.status,'COMPLETED');
  let variants=0;for(let j=0;j<120;j++){variants=await db.fileAssetVariant.count({where:{assetId:sourceRow.assetId}});if(variants===8)break;await wait(500);}assert.equal(variants,8);
  const original=Buffer.from(await(await apiS3.send(new GetObjectCommand({Bucket:'aboessa-media',Key:sourceRow.asset.key}))).Body.transformToByteArray());assert.equal(sha(original),sha(source));
  const preview=await req('GET','/api/admin/product-intake/sessions/'+session.id+'/enhancements/candidates/'+job.candidate.id+'/preview?edge=1024');assert.ok(preview.data.base64);
  const publicPath=new URL(sourceRow.asset.url,'https://phase91-staging.invalid').pathname;
  const publicRead=await fetch(base+publicPath);assert.equal(publicRead.status,404);await publicRead.body?.cancel();
  const status=(await req('GET','/api/admin/product-intake/sessions/'+session.id+'/enhancements')).data;
  await req('POST','/api/admin/product-intake/sessions/'+session.id+'/enhancements/decision',{clientImageId:imageId,requestKey:randomUUID(),expectedRevision:session.revision,expectedMediaRevision:status.mediaRevision,action:'REJECT',candidateId:job.candidate.id,reviewed:true},201);
  out.images.push({index:i+1,width:4000,height:3000,sourceBytes:source.length,sourceSha256:sha(source),originalHashMatches:true,variants,uploadMs:upload.ms,cleanAndWaitMs:Date.now()-jobAt,privateCandidatePreview:true,publicOriginal404:true,decision:'SYNTHETIC_REJECT'});
 }
 const listed=await operator.send(new ListObjectsV2Command({Bucket:'aboessa-media'}));assert.equal(listed.IsTruncated,false);
 await operator.send(new CreateBucketCommand({Bucket:'recovery-media'}));const backupAt=Date.now();let total=0;
 for(const object of listed.Contents??[]){const got=await operator.send(new GetObjectCommand({Bucket:'aboessa-media',Key:object.Key}));const bytes=Buffer.from(await got.Body.transformToByteArray());
  await operator.send(new PutObjectCommand({Bucket:'recovery-media',Key:object.Key,Body:bytes,ContentType:got.ContentType}));
  const back=await operator.send(new GetObjectCommand({Bucket:'recovery-media',Key:object.Key}));assert.equal(back.ContentType,got.ContentType);assert.equal(sha(Buffer.from(await back.Body.transformToByteArray())),sha(bytes));total+=bytes.length;}
 out.mediaRecovery={objects:listed.Contents.length,bytes:total,hashesAndContentTypesMatch:true,durationMs:Date.now()-backupAt,syntheticOnly:true};
 assert.equal(await db.productListing.count(),0);assert.equal(await db.order.count(),0);assert.equal(await db.customer.count(),0);assert.equal(await db.inventoryMovement.count(),0);assert.equal(await db.recognitionUsage.count(),0);
 const sessions=await db.productIntakeSession.findMany({select:{status:true,quantity:true,locationId:true,completedProductId:true}});
 assert.ok(sessions.every(s=>s.status==='DRAFT'&&s.quantity===null&&s.locationId===null&&s.completedProductId===null));
 out.final={sessions:sessions.length,products:0,customers:0,orders:0,inventoryMovements:0,paidUsageRows:0,completedProducts:0,allDraftsPending:true};out.passed=true;
 console.log(JSON.stringify(out));
}
main().catch(e=>{console.error(JSON.stringify({passed:false,code:e.code||e.message}));process.exitCode=1;}).finally(async()=>{apiS3.destroy();wrong.destroy();operator.destroy();await db.$disconnect();});
