if(process.env.REZONA_PHASE72_QA!=='1')throw Error('Explicit local audit only');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const runId=process.argv[2];if(!/^20261122-[a-f0-9]{8}$/.test(runId??''))throw Error('Invalid run');
const out=path.resolve(__dirname,'../docs/benchmarks/phase7-2',runId);
if(!fs.existsSync(path.join(out,'run.json')))throw Error('Unknown run');
(async()=>{
 const secrets=JSON.parse(fs.readFileSync(path.join('D:/rezona-phase7-2-qa',runId,'runtime-secrets.json'),'utf8'));
 if(!secrets.protectedAuditEmail || !secrets.protectedAuditPassword)throw Error('Provide protected QA audit login in private local configuration, never source');
 const origin='http://127.0.0.1:18493/api';
 const response=await fetch(origin+'/admin/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:secrets.protectedAuditEmail,password:secrets.protectedAuditPassword})});
 const login=await response.json();assert.equal(response.status,201);const token=login.data.accessToken;
 const j=JSON.parse(fs.readFileSync('D:/rezona-phase7-1-qa/real-products-20261121/intake-journal.json','utf8')),rows=[];
 const get=async url=>{const r=await fetch(origin+url,{headers:{authorization:'Bearer '+token}});assert.equal(r.status,200);return(await r.json()).data;};
 for(const old of j.products){const product=await get('/admin/products/'+old.productId),inventory=await get('/admin/products/'+old.productId+'/inventory');
   assert.equal(product.status,'DRAFT');assert.equal(product.availableQuantity,1);assert.equal(product.totalQuantity,1);assert.equal(Number(product.price),10000);
   assert.equal(product.imageUrls.length,1);
   for(const key of ['id','title','description','categoryId','imageUrls','price','status','totalQuantity','availableQuantity','soldQuantity'])
     assert.deepEqual(product[key],old.finalVerification.product[key]);
   assert.deepEqual(inventory,old.finalVerification.inventory);
   rows.push({n:old.n,id:product.id,title:product.title,status:product.status,available:product.availableQuantity,total:product.totalQuantity,
     price:product.price,imageUrls:product.imageUrls,inventory});}
 fs.writeFileSync(path.join(out,'protected-products-'+Date.now()+'.json'),JSON.stringify({passed:true,scope:'Read-only normal authenticated API, original six Phase71 QA products unchanged; login only POST',rows},null,2),{flag:'wx'});
 console.log(JSON.stringify({passed:true,originalProductsVerified:rows.length}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
