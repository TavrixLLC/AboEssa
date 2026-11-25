// Runs as a credential-free, network-disabled Linux QA driver in a hard-limited container.
if(process.env.REZONA_PHASE71_CONTAINER!=='1')throw Error('Isolated container only');
const fs=require('node:fs/promises'),{isolatedSegmentation,stopSegmentationWorker}=require('/app/dist/src/image-enhancement/segmentation-isolate');
(async()=>{const bytes=await fs.readFile('/input.jpg'),rows=[];
 for(const model of ['u2netp','u2net']){stopSegmentationWorker();for(let i=0;i<6;i++){
  const start=performance.now();try{const out=await isolatedSegmentation({bytes,mime:'image/jpeg',background:'WHITE',region:{x:.63,y:0,width:.35,height:1}},
   {model,modelFile:`/models/${model}.onnx`,runtimeDirectory:'/runtime'});rows.push({model,repeat:i,ok:true,wallMs:Math.round(performance.now()-start),metrics:out.metrics,details:out.details});}
  catch(e){rows.push({model,repeat:i,ok:false,wallMs:Math.round(performance.now()-start),error:e.message});}
 }}stopSegmentationWorker();
 const optional=async p=>{try{return(await fs.readFile(p,'utf8')).trim();}catch{return null;}};
 console.log(JSON.stringify({scope:'Linux Docker offline CPU 2, memory 1GiB, swap disabled, pids64, nonroot, readonly, model/runtime/source readonly; no database/provider credentials; full model one job per process after unsafe reuse investigation',node:process.version,
  cgroupMemoryPeakBytes:await optional('/sys/fs/cgroup/memory.peak'),cgroupMemoryLimit:await optional('/sys/fs/cgroup/memory.max'),cpuStat:await optional('/sys/fs/cgroup/cpu.stat'),rows}));
})().catch(e=>{stopSegmentationWorker();console.error(e.message);process.exitCode=1;});
