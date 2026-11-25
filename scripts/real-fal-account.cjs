// One read-only pricing request. Does not call inference or broaden key permissions.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const m=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync('D:/rezona-real-fal-qa/current.json','utf8')).manifest,'utf8'));
const key=fs.readFileSync('D:/rezona-phase7-2-qa/fal-pilot/backend.env','utf8').split(/\r?\n/).find(s=>s.startsWith('FAL_KEY='))?.slice(8).trim();
if(!key)throw Error('BACKEND_FAL_KEY_MISSING');
(async()=>{const r=await fetch('https://api.fal.ai/v1/models/pricing?endpoint_id=google%2Fnano-banana-lite%2Fedit',{headers:{authorization:'Key '+key},redirect:'error',signal:AbortSignal.timeout(15000)});
 const b=await r.text();if(b.length>16000)throw Error('PRICING_RESPONSE_TOO_LARGE');
 const p=r.ok?JSON.parse(b).prices?.find(p=>p.endpoint_id==='google/nano-banana-lite/edit'):null;
 const evidence={at:new Date().toISOString(),method:'GET',sourceUrl:'https://api.fal.ai/v1/models/pricing',status:r.status,price:p?{model:p.endpoint_id,unitPriceUsd:String(p.unit_price),unit:p.unit,currency:p.currency}:null,inferenceCalls:0,permissionsExpanded:false};
 evidence.quoteFingerprint=createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
 fs.writeFileSync(path.join(m.out,'pricing-'+Date.now()+'.json'),JSON.stringify(evidence,null,2),{flag:'wx'});console.log(JSON.stringify(evidence));
})().catch(()=>{console.error('READ_ONLY_PRICING_FAILED');process.exitCode=1});
