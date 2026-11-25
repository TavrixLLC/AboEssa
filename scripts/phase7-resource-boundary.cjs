if(process.env.REZONA_PHASE7_QA!=='1')throw Error('Explicit Phase7 QA only');
const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp'),assert=require('node:assert/strict');
const {isolatedEnhancement}=require('../dist/src/image-enhancement/enhancement-isolate');
(async()=>{
 const bytes=await sharp({create:{width:4000,height:3000,channels:3,background:'#fff'}}).composite([{input:Buffer.from('<svg width="4000" height="3000"><rect x="1000" y="300" width="2000" height="2400" fill="#184d3c"/></svg>')}]).png().toBuffer();
 const results=[];
 for(const mode of ['CLEAN','BACKGROUND_REMOVE']){const start=Date.now(),out=await isolatedEnhancement({bytes,mime:'image/png',mode,matting:true,background:'WHITE'});assert.equal((await sharp(out.png).metadata()).width,1024);results.push({mode,totalMs:Date.now()-start,metrics:out.metrics});}
 const oversize=await sharp({create:{width:4001,height:3000,channels:3,background:'#fff'}}).png().toBuffer();
 await assert.rejects(isolatedEnhancement({bytes:oversize,mime:'image/png',mode:'CLEAN',matting:false,background:'WHITE'}));
 const result={time:new Date().toISOString(),passed:true,scope:'Single local 12MP boundary exercise, not peak-concurrency/production SLO proof',pixels:12000000,oversizePixelsRejected:12003000,childHeapMiB:128,sharpConcurrency:1,timeoutMs:30000,rssIsSnapshotNotPeak:true,results};
 await fs.writeFile(path.resolve(__dirname,'../docs/benchmarks/phase7/resource-boundary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
