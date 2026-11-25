if(process.env.REZONA_PHASE71_QA!=='1')throw Error('Explicit local Phase7.1 QA required');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const {isolatedSegmentation,stopSegmentationWorker}=require('../dist/src/image-enhancement/segmentation-isolate');
const root=path.resolve(__dirname,'..'),out='D:/rezona-phase7-1-qa/evidence';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{await fs.mkdir(out,{recursive:true});
 const real=await fs.readFile('D:/rezona-phase5-qa/physical-upload-original.jpg');
 const samples=[{id:'rexona-real',real:true,bytes:real,mime:'image/jpeg'},
  {id:'rexona-guided',real:true,bytes:real,mime:'image/jpeg',region:{x:0.63,y:0,width:0.35,height:1}}];
 for(const [id,bg,fill,extra] of [['white-box','#f9f9f9','#ffffff',''],['dark-can','#181b22','#08090a',''],['thin-handle','#dccab8','#487b83','<path d="M390 210 C700 170 700 470 390 440" fill="none" stroke="#487b83" stroke-width="12"/>']]) {
  samples.push({id,real:false,mime:'image/png',bytes:await sharp(Buffer.from(`<svg width="800" height="600"><rect width="800" height="600" fill="${bg}"/><rect x="220" y="70" width="260" height="480" rx="30" fill="${fill}" stroke="#888" stroke-width="2"/>${extra}<text x="245" y="275" fill="#c49a39" font-size="32">QA ONLY</text><text x="255" y="330" fill="#c49a39" font-size="25">400 ml</text></svg>`)).png().toBuffer()});
 }
 const rows=[],saved=new Set();
 for(const model of ['u2netp','u2net']) {
  stopSegmentationWorker();
  for(const s of samples) for(let repeat=0;repeat<3;repeat++) {const start=performance.now();try{
   const v=await isolatedSegmentation({bytes:s.bytes,mime:s.mime,background:'WHITE',region:s.region},{model,modelFile:`D:/rezona-phase7-1-qa/models/${model}.onnx`,runtimeDirectory:'D:/rezona-phase7-1-qa/runtime'});
   const master=await sharp(v.png).webp({lossless:true}).toBuffer(),opaque=await sharp(v.png).webp({quality:95}).toBuffer();
   const [a,b,lossy]=await Promise.all([sharp(v.png).removeAlpha().raw().toBuffer(),sharp(master).removeAlpha().raw().toBuffer(),sharp(opaque).removeAlpha().raw().toBuffer()]);
   let absolute=0,maxDifference=0;for(let p=0;p<a.length;p++){const d=Math.abs(a[p]-lossy[p]);absolute+=d;maxDifference=Math.max(maxDifference,d);}
   if(!a.equals(b))throw Error('LOSSLESS_RGB_MISMATCH');
   const variants=[];for await(const variant of require('../dist/src/image-optimization/image-codec').encodeVariants(master,'image/webp'))variants.push(variant);
   if(!saved.has(s.id+'/'+model)){saved.add(s.id+'/'+model);await fs.writeFile(path.join(out,`${s.id}-original.${s.real?'jpg':'png'}`),s.bytes);await fs.writeFile(path.join(out,`${s.id}-${model}-mask.png`),v.mask);await fs.writeFile(path.join(out,`${s.id}-${model}-white.png`),v.png);await fs.writeFile(path.join(out,`${s.id}-${model}-lossless.webp`),master);await fs.writeFile(path.join(out,`${s.id}-${model}-q95.webp`),opaque);
    const checker=Buffer.alloc(1024*1024*3);for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){const n=((x>>4)+(y>>4))%2?210:240;checker.fill(n,(y*1024+x)*3,(y*1024+x)*3+3);}
    await sharp(checker,{raw:{width:1024,height:1024,channels:3}}).composite([{input:v.foreground}]).png().toFile(path.join(out,`${s.id}-${model}-checker.png`));
   }
   rows.push({sample:s.id,real:s.real,model,repeat,success:true,wholeJobWithEncodesMs:Math.round(performance.now()-start),metrics:v.metrics,details:v.details,warnings:v.warnings,sourceSha256:hash(s.bytes),outputSha256:hash(master),storage:{source:s.bytes.length,png:v.png.length,webpLossless:master.length,webpQ95:opaque.length,mask:v.mask.length,variants:variants.reduce((n,x)=>n+x.body.length,0),losslessDecodedRgbEqual:true,q95MeanAbsoluteRgbDifference:absolute/a.length,q95MaxChannelDifference:maxDifference,q95DifferenceIsNotAnOcrOrVisualAcceptanceScore:true}});
  }catch(e){rows.push({sample:s.id,real:s.real,model,repeat,success:false,error:e.message,wholeJobWithEncodesMs:Math.round(performance.now()-start)});}const r=rows.at(-1);console.log(JSON.stringify({sample:s.id,model,repeat,success:r.success,ms:r.wholeJobWithEncodesMs,error:r.error}));}
 }
 stopSegmentationWorker();await fs.writeFile(path.join(root,'docs/benchmarks/phase7-1/local-benchmark.json'),JSON.stringify({time:new Date().toISOString(),host:{platform:process.platform,node:process.version,cpus:require('os').cpus().length,totalRam:require('os').totalmem()},distinctRealProducts:1,syntheticFixtures:3,repetitionsPerInput:3,externalInferenceCalls:0,scope:'local CPU Node ONNX; no physical-device or production capacity acceptance',successMeaning:'A valid derivative was computed, NOT accurate isolation or employee approval. Guided/automatic are conditions of the SAME photo.',rows},null,2));
})().catch(e=>{stopSegmentationWorker();console.error(e);process.exitCode=1;});
