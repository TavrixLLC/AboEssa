// Public documentation + local key-presence check only. NEVER submits inference.
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const base='D:/rezona-phase7-2-qa/fal-pilot';fs.mkdirSync(base,{recursive:true});
const dir=path.join(base,'preflight-'+randomUUID().slice(0,8));fs.mkdirSync(dir);
const pages=[['model-api','https://fal.ai/models/google/nano-banana-lite/edit/api'],
 ['model','https://fal.ai/models/google/nano-banana-lite/edit'],
 ['retention','https://fal.ai/docs/documentation/model-apis/media-expiration'],
 ['pricing-api','https://fal.ai/docs/model-apis/model-pricing'],
 ['terms','https://fal.ai/terms']];
const publicRows=[];
function scan(html){
 const texts=[html],records=[];
 for(const m of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)){
  try{const chunk=JSON.parse(m[1]);if(typeof chunk[1]==='string')texts.push(chunk[1]);}catch{}
 }
 const found=[],seen=new Set();
 function walk(v,depth=0){if(depth>12)return;
  if(typeof v==='string'){
   if(v.length<100000 && /^[\[{]/.test(v))try{walk(JSON.parse(v),depth+1);}catch{}
   if(v.length<1000 && /\$\d|per (image|token)|input token|output token|billing_unit/i.test(v)&&!seen.has(v)){seen.add(v);found.push(v);}
  } else if(v&&typeof v==='object'){
   if(v.properties?.image_urls&&v.properties?.num_images)records.push(v);
   for(const [k,x]of Object.entries(v)){
    if(k==='endpointBilling')records.push(x);
    walk(x,depth+1);
   }
  }
 }
 for(const t of texts)for(const line of t.split('\n')){
  const pos=line.indexOf(':');if(pos>=0)try{walk(JSON.parse(line.slice(pos+1)));}catch{}
 }
 const snippets=[];
 for(const t of texts){for(const m of t.matchAll(/.{0,90}(?:\$0\.|\$1\b|per million|per 1M|per image|billing_unit|token pricing).{0,300}/gi))
   if(snippets.length<30)snippets.push(m[0]);}
 return {records:[...new Map(records.map(r=>[JSON.stringify(r),r])).values()],priceText:found.slice(0,25),snippets};
}
(async()=>{
 for(const [name,url]of pages){try{
   const r=await fetch(url,{signal:AbortSignal.timeout(25000)}),text=await r.text();
   if(text.length>4*1024*1024)throw Error('Public page too large');
   const file=name+'.html';fs.writeFileSync(path.join(dir,file),text,{flag:'wx'});
   const extracted=scan(text);fs.writeFileSync(path.join(dir,name+'-extracted.json'),JSON.stringify(extracted,null,2),{flag:'wx'});
   publicRows.push({name,url,status:r.status,finalUrl:r.url,sha256:createHash('sha256').update(text).digest('hex'),file,
     inputSchemaCount:extracted.records.filter(x=>x.properties?.image_urls).length,
     snippets:extracted.snippets.slice(0,5),priceText:extracted.priceText.slice(0,5)});
  }catch{publicRows.push({name,url,status:'UNAVAILABLE'});}
 }
 const keyFile=path.join(base,'backend.env');let keyPresent=!!process.env.FAL_KEY;
 if(fs.existsSync(keyFile)){const env=require('dotenv').parse(fs.readFileSync(keyFile));keyPresent=!!env.FAL_KEY?.trim();}
 const report={time:new Date().toISOString(),privateDirectory:dir,inferenceRequests:0,keyPresent,pages:publicRows};
 fs.writeFileSync(path.join(dir,'preflight.json'),JSON.stringify(report,null,2),{flag:'wx'});
 console.log(JSON.stringify(report,null,2));
})().catch(()=>{console.error('FAL_PREFLIGHT_FAILED_NO_INFERENCE');process.exitCode=1;});
