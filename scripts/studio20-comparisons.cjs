const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp'),{createHash}=require('node:crypto');
module.exports=async c=>{
 const files=fs.readdirSync(c.out).filter(n=>/^all39-workflow-\d+\.json$/.test(n)).sort(),evidence=JSON.parse(fs.readFileSync(path.join(c.out,files.at(-1)),'utf8'));
 const dir=path.join(c.qa,'comparisons-'+Date.now());fs.mkdirSync(dir);
 const rows=[],ok=async p=>{const r=await p;assert.equal(r.status,200);return r.data;};
 for(const code of ['F01','E01','H01','G01']){
   const row=evidence.rows.find(r=>r.code===code),base='/admin/product-intake/sessions/'+row.sessionId,status=await ok(c.request('GET',base+'/enhancements'));
   const original=await ok(c.request('GET',base+'/preview')),local=status.jobs.find(j=>j.mode==='NEURAL_BACKGROUND_REMOVE');
   const bodies=[Buffer.from(original.dataBase64,'base64')],ids=[local.candidate.id,...row.jobs.filter(j=>j.mode==='FAITHFUL_COMPOSITE').map(j=>j.candidateId),...row.jobs.filter(j=>j.mode==='GENERATIVE_3D_HERO').map(j=>j.candidateId)];
   for(const id of ids){const j=status.jobs.find(j=>j.candidate?.id===id);if(j.mode.startsWith('PRODUCT_STUDIO_')){assert.equal(j.lineage.style,undefined);assert.equal(j.candidate.processingDetails.style,undefined);assert.ok(j.candidate.processingDetails.templateSnapshot);}
     const p=await ok(c.request('GET',base+'/enhancements/candidates/'+id+'/preview?edge=1024'));bodies.push(Buffer.from(p.base64,'base64'));}
   const labels=['ORIGINAL - SYNTHETIC QA','APPROVED LOCAL MASK','FAITHFUL - LOCAL MOCK','HERO - MOCK SURROGATE'],panels=[];
   for(let i=0;i<bodies.length;i++)panels.push({input:await sharp(bodies[i]).resize(420,420,{fit:'contain',background:'#0C0F0F'}).png().toBuffer(),left:20+i*440,top:70});
   const header=Buffer.from(`<svg width="1780" height="540"><rect width="1780" height="540" fill="#0C0F0F"/><text x="22" y="27" font-family="Arial" font-size="22" fill="#E7BC61">${code} - WORKFLOW MOCKS ONLY. NO FAL REQUEST / NO REAL-PRODUCT QUALITY CLAIM.</text>${labels.map((label,i)=>`<text x="${20+i*440}" y="58" font-family="Arial" font-size="16" fill="#F8F6F1">${label}</text>`).join('')}<text x="22" y="520" font-family="Arial" font-size="17" fill="#E7BC61">Private authenticated previews (lossy review copies); full-resolution original RGB proof is recorded by native codec tests.</text></svg>`);
   const bytes=await sharp(header).composite(panels).png().toBuffer(),name=code+'-comparison.png';fs.writeFileSync(path.join(dir,name),bytes,{flag:'wx'});
   rows.push({code,path:path.join(dir,name),sha256:createHash('sha256').update(bytes).digest('hex'),sessionId:row.sessionId,previewOnly:true,mockOnly:true});
 }
 fs.writeFileSync(path.join(c.out,'comparison-boards-'+Date.now()+'.json'),JSON.stringify({directory:dir,rows,paidRequests:0,realProductImagesUsed:0,claims:'Workflow only, not fal quality'},null,2),{flag:'wx'});
 c.checks.push('Read-only normal JWT previews: four private original/local/faithful/hero boards, synthetic fixtures only; internal prompts absent from lineage/processingDetails; no new generation');
};
