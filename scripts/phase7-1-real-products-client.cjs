// Actual authenticated HTTP only. No Prisma/SQL, direct product creation, fixture seeding or publishing.
if(process.env.REZONA_PHASE71_QA!=='1')throw Error('Explicit isolated QA only');
const fs=require('node:fs/promises'),path=require('node:path');
const origin='http://127.0.0.1:18493',folder='D:/rezona-phase7-1-qa/real-products-20261121';
async function session(){
 await fs.mkdir(folder,{recursive:true});
 const login=await fetch(origin+'/api/admin/auth/login',{method:'POST',headers:{'content-type':'application/json','X-Device-Name':'Six real product intake QA'},body:JSON.stringify({email:'phase7-device-qa@example.test',password:'QaPhase7LocalOnly2026!'})});
 const body=await login.json();if(!login.ok||!body.data?.accessToken)throw Error('Existing QA admin login failed: '+login.status+' '+JSON.stringify(body.error??body.message));
 const token=body.data.accessToken,actor=body.data.admin.id,trail=[];
 async function request(method,url,data,key){
  if(!url.startsWith('/admin/')&&!url.startsWith('/media/'))throw Error('QA admin route required');
  const categoryWrite=method==='POST'&&url==='/admin/categories'&&['الإلكترونيات','المنزل والمطبخ','العناية والجمال'].includes(data?.name);
  if(method!=='GET'&&!categoryWrite&&(!url.startsWith('/admin/product-intake/sessions')||url.endsWith('/cancel')||url.includes('/recognition')||(url.endsWith('/submit')&&(process.env.REZONA_REAL_PRODUCTS_FINALIZE!=='1'||!key))))throw Error('Write outside user-approved intake scope');
  const form=data instanceof FormData,r=await fetch(origin+'/api'+url,{method,headers:{authorization:'Bearer '+token,'X-Intake-Actor':actor,...(!form?{'content-type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:data===undefined?undefined:form?data:JSON.stringify(data),signal:AbortSignal.timeout(60000)});
  const b=await r.json();trail.push({time:new Date().toISOString(),method,path:url,status:r.status});
  if(!r.ok)throw Error(method+' '+url+' '+r.status+' '+JSON.stringify(b));return b.data;
 }
 async function all(url,limit=100){const result=[];for(let page=1;page<=100;page++){const row=await request('GET',url+(url.includes('?')?'&':'?')+`page=${page}&limit=${limit}`);result.push(...row.items);if(row.meta?.hasMore===false||row.items.length<limit||row.meta?.totalPages<=page) return result;}throw Error('Pagination bound reached');}
 async function save(name,value){await fs.writeFile(path.join(folder,name),JSON.stringify(value,null,2));await fs.writeFile(path.join(folder,'http-trail-'+process.pid+'.json'),JSON.stringify(trail,null,2));}
 return {origin,folder,actor,request,all,save,trail};
}
module.exports={session,folder,origin};
if(require.main===module)(async()=>{const s=await session();const data={time:new Date().toISOString(),origin,actor:s.actor,categories:await s.all('/admin/categories'),warehouses:await s.all('/admin/warehouses?activeOnly=true'),locations:await s.all('/admin/warehouse-locations?activeOnly=true&physicalOnly=true'),products:await s.all('/admin/products')};let name='catalog-before.json';try{await fs.access(path.join(folder,name));name='catalog-inspection-'+Date.now()+'.json';}catch(e){if(e.code!=='ENOENT')throw e;}await s.save(name,data);console.log(JSON.stringify({categories:data.categories,warehouses:data.warehouses.map(x=>({id:x.id,code:x.code,name:x.name})),locations:data.locations.map(x=>({id:x.id,code:x.code,name:x.name,warehouseId:x.warehouseId})),productCount:data.products.length,snapshot:name}));})().catch(e=>{console.error(e.message);process.exitCode=1;});
