if(process.env.REZONA_PHASE71_QA!=='1')throw Error('Explicit isolated QA required');
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {session,folder}=require('./phase7-1-real-products-client.cjs');
const regions={2:{x:0,y:0,width:1,height:1},3:{x:0,y:0,width:1,height:1},4:{x:.06,y:.065,width:.86,height:.67},6:{x:.035,y:0,width:.93,height:.9}};
(async()=>{const api=await session(),j=JSON.parse(await fs.readFile(path.join(folder,'intake-journal.json'),'utf8'));
 const save=()=>api.save('intake-journal.json',j);
 for(const p of j.products){if(!regions[p.n])continue;const endpoint=`/admin/product-intake/sessions/${p.intakeId}/enhancements`;
  p.guidedRequestKey??=randomUUID();p.foregroundRegion=regions[p.n];await save();
  const state=await api.request('POST',endpoint,{clientImageId:p.clientImageId,requestKey:p.guidedRequestKey,mode:'NEURAL_BACKGROUND_REMOVE',foregroundRegion:p.foregroundRegion});
  // Different source/rectangle identities remain separate candidates.
  let job=state.jobs.find(x=>x.mode==='NEURAL_BACKGROUND_REMOVE'&&x.id!==p.automatic.id);if(!job)throw Error('Guided job not found');
  for(let n=0;n<160;n++){const s=await api.request('GET',endpoint);job=s.jobs.find(x=>x.id===job.id);if(['COMPLETED','FAILED','CANCELLED'].includes(job.status))break;await new Promise(r=>setTimeout(r,500));}
  p.guided=job;
  if(job.candidate){if(job.candidate.processingDetails.sourceHash!==p.sourceRequestHash)throw Error('Immutable original lineage mismatch');for(const kind of ['candidate','mask']){const v=await api.request('GET',`${endpoint}/candidates/${job.candidate.id}/preview?edge=1024&kind=${kind}`);await fs.writeFile(path.join(folder,`${String(p.n).padStart(2,'0')}-guided-${kind}.webp`),Buffer.from(v.base64,'base64'));}}
  await save();console.log(JSON.stringify({n:p.n,guided:job.status,error:job.errorCode}));
 }
 // Neutral CLEAN fallbacks preserve the entire captured package; not mislabelled as successful isolation.
 for(const p of j.products.filter(p=>[2,3,4].includes(p.n))){const endpoint=`/admin/product-intake/sessions/${p.intakeId}/enhancements`;p.cleanRequestKey??=randomUUID();await save();
  const initial=await api.request('POST',endpoint,{clientImageId:p.clientImageId,requestKey:p.cleanRequestKey,mode:'CLEAN'});let job=initial.jobs.find(x=>x.mode==='CLEAN');
  for(let n=0;n<100;n++){const s=await api.request('GET',endpoint);job=s.jobs.find(x=>x.id===job.id);if(['COMPLETED','FAILED','CANCELLED'].includes(job.status))break;await new Promise(r=>setTimeout(r,500));}p.clean=job;
  if(job.candidate){const v=await api.request('GET',`${endpoint}/candidates/${job.candidate.id}/preview?edge=1024`);await fs.writeFile(path.join(folder,`${String(p.n).padStart(2,'0')}-clean-candidate.webp`),Buffer.from(v.base64,'base64'));}await save();console.log(JSON.stringify({n:p.n,clean:job.status}));
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
