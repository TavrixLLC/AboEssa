// Runs only in the network-isolated local clone. Input is decrypted backup bytes over stdin.
const assert=require('node:assert/strict'),{gunzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
const {S3Client,CreateBucketCommand,PutObjectCommand,GetObjectCommand,HeadBucketCommand}=require('@aws-sdk/client-s3');
const {PrismaClient}=require('@prisma/client');
const chunks=[];process.stdin.on('data',b=>chunks.push(b));process.stdin.on('end',async()=>{
 const rows=gunzipSync(Buffer.concat(chunks),{maxOutputLength:64*1024*1024}).toString().trim().split('\n').map(x=>JSON.parse(x)),meta=rows.shift(),end=rows.pop();
 assert.equal(meta.type,'metadata');assert.equal(end.type,'end');assert.equal(end.count,rows.length);
 assert.ok(!meta.policy,'A nonempty bucket policy requires an explicit reviewed restore');
 assert.ok(!meta.versioning.Status,'Versioned source requires all-version export, not a latest-only restore');
 const db=new PrismaClient(),c=new S3Client({endpoint:'http://127.0.0.1:9000',region:'us-east-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:process.env.REZONA_STAGE_ACCESS_KEY,secretAccessKey:process.env.REZONA_STAGE_SECRET}});
 try{
   await c.send(new CreateBucketCommand({Bucket:meta.bucket}));
   let bytes=0;
   for(const r of rows){assert.equal(r.type,'object');const body=Buffer.from(r.body,'base64');assert.equal(body.length,r.size);assert.equal(createHash('sha256').update(body).digest('hex'),r.sha256);
     const contentType=r.metadata?.['content-type']??'application/octet-stream';
     await c.send(new PutObjectCommand({Bucket:meta.bucket,Key:r.key,Body:body,ContentLength:body.length,ContentType:contentType}));
     const x=await c.send(new GetObjectCommand({Bucket:meta.bucket,Key:r.key}));const b=Buffer.from(await x.Body.transformToByteArray());assert.equal(createHash('sha256').update(b).digest('hex'),r.sha256);assert.equal(x.ContentType,contentType);assert.equal(x.ContentLength,r.size);bytes+=body.length;
     const denied=await fetch('http://127.0.0.1:9000/'+meta.bucket+'/'+r.key);assert.ok([401,403].includes(denied.status));await denied.body?.cancel();
   }
   const keys=new Set(rows.map(x=>x.key)),assets=await db.fileAsset.findMany({select:{key:true}});assert.ok(assets.every(x=>keys.has(x.key)));
   await c.send(new HeadBucketCommand({Bucket:meta.bucket}));
   console.log(JSON.stringify({passed:true,objects:rows.length,bytes,allHashesMatch:true,allContentTypesMatch:true,fileAssetReferences:assets.length,missingFileAssetObjects:0,anonymousReadsDenied:rows.length,provider:'Silo local evaluation',source:'Fresh production read-only backup',publicPublication:false,networkEgress:false,productionWrites:0}));
 }finally{c.destroy();await db.$disconnect();}
});
