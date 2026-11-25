if(process.env.REZONA_PHASE71_QA!=='1')throw Error('Explicit isolated QA required');
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),sharp=require('sharp');
const {session,folder}=require('./phase7-1-real-products-client.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const definitions=[
 {n:1,time:'16.49.55',title:'جهاز لوحي TECLAST tPad',category:'الإلكترونيات',description:'تظهر في الصورة عبوة جهاز لوحي من TECLAST تحمل اسم tPad. لا تؤكد هذه الصورة وحدها رقم الموديل أو السعة أو المواصفات أو حالة الجهاز داخل العبوة.',queries:['TECLAST','tPad','تابلت','جهاز لوحي']},
 {n:2,time:'16.51.05',title:'بروجكتر Yoton Y7',category:'الإلكترونيات',description:'تظهر عبوة جهاز عرض فيديو من Yoton، ورمز Y7 مطبوع عليها. الصورة للعبوة؛ لم يتم التحقق من الدقة أو السطوع أو التوصيلات أو حالة الجهاز.',queries:['Yoton','Y7','بروجكتر','جهاز عرض']},
 {n:3,time:'16.51.47',title:'مستقبل صوت بلوتوث للسيارة UGREEN',category:'الإلكترونيات',description:'تظهر علامة UGREEN وعبارة Car Bluetooth Audio Receiver على العبوة المصوّرة. لم يتم التحقق من رقم الموديل أو محتويات العبوة أو أداء الجهاز.',queries:['UGREEN','بلوتوث','مستقبل صوت','Bluetooth']},
 {n:4,time:'16.52.09',title:'لوح تقطيع بني مستطيل',category:'المنزل والمطبخ',description:'لوح تقطيع بني مستطيل بزوايا مستديرة، داخل غلاف شفاف، وتظهر عبارة CUTTING BOARD على الملصق. الأبعاد ونوع المادة غير مؤكدة من الصورة.',queries:['لوح تقطيع','تقطيع','CUTTING BOARD']},
 {n:5,time:'16.48.46',title:'علبة صابون يدوي GUXIAOBEI',category:'العناية والجمال',description:'علبة متعددة الألوان يظهر عليها اسم GUXIAOBEI وعبارة HANDMADE SOAP. لم يتم التحقق من عدد القطع أو الوزن أو المكونات أو محتويات العبوة.',queries:['GUXIAOBEI','صابون','SOAP']},
 {n:6,time:'16.49.20',title:'قطعة ديكور بشكل جرار وعجلة مائية',category:'المنزل والمطبخ',description:'قطعة ديكور بألوان بنية وذهبية وخضراء، بتصميم جرار وعجلة وقاعدة ذات مظهر صخري. لا تؤكد الصورة وجود مضخة أو تشغيل الماء أو نوع المادة أو الأبعاد.',queries:['ديكور','نافورة','جرار','عجلة مائية']},
];
(async()=>{const api=await session(),journalFile=path.join(folder,'intake-journal.json');let j;
 try{j=JSON.parse(await fs.readFile(journalFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={batch:'six-real-products-20261121',createdAt:new Date().toISOString(),origin:api.origin,metadataMethod:'MANUAL_VISIBLE_INFORMATION_REVIEW_NO_MODEL_RECOGNITION',userApproved:{categories:['الإلكترونيات','المنزل والمطبخ','العناية والجمال'],pricesAndLocationDelegated:true,quantityPerProduct:1},products:definitions.map(d=>({...d,clientDraftId:randomUUID(),submissionOperationKey:randomUUID(),clientImageId:randomUUID(),autoRequestKey:randomUUID()}))};}
 const save=async()=>api.save('intake-journal.json',j);await save();
 let categories=await api.all('/admin/categories');
 for(const [i,name]of j.userApproved.categories.entries()){if(!categories.some(x=>x.name===name&&x.isActive)){const cat=await api.request('POST','/admin/categories',{name,slug:['real-qa-electronics','real-qa-home-kitchen','real-qa-beauty'][i]});categories.push(cat);}}
 const locations=await api.all('/admin/warehouse-locations?activeOnly=true&physicalOnly=true'),warehouses=await api.all('/admin/warehouses?activeOnly=true');
 const warehouse=warehouses.find(w=>w.code==='MAIN-886368'),location=locations.find(l=>l.warehouseId===warehouse?.id&&l.code==='A-01');if(!location)throw Error('Delegated existing location is no longer available');
 j.location={warehouseId:warehouse.id,warehouseCode:warehouse.code,warehouseName:warehouse.name,locationId:location.id,code:location.code,name:location.name};j.categories=categories.filter(c=>j.userApproved.categories.includes(c.name));await save();
 // Search every relevant spelling/brand before creating any draft/product.
 for(const p of j.products){p.catalogSearch=[];for(const term of p.queries){const found=await api.all('/admin/products?search='+encodeURIComponent(term));p.catalogSearch.push({term,matches:found.map(x=>({id:x.id,title:x.title,status:x.status,categoryId:x.categoryId}))});}await save();}
 for(const p of j.products){
  const originalPath=`C:/Users/3ma/Downloads/منتجات/WhatsApp Image 2026-11-21 at ${p.time}.jpeg`,bytes=await fs.readFile(originalPath),sourceHash=sha(bytes),meta=await sharp(bytes).metadata();
  if(p.originalSha256&&p.originalSha256!==sourceHash)throw Error('Immutable source changed for '+p.n);
  const originalCopy=path.join(folder,`${String(p.n).padStart(2,'0')}-original.jpeg`);
  try{const prior=await fs.readFile(originalCopy);if(sha(prior)!==sourceHash)throw Error('Original backup conflict');}catch(e){if(e.code!=='ENOENT')throw e;await fs.writeFile(originalCopy,bytes,{flag:'wx'});}
  Object.assign(p,{originalPath,originalCopy,originalSha256:sourceHash,sourceRequestHash:sha(Buffer.concat([Buffer.from('image/jpeg'),bytes])),originalBytes:bytes.length,originalDimensions:{width:meta.width,height:meta.height},priceIqd:'10000',quantity:1,categoryId:j.categories.find(c=>c.name===p.category).id});await save();
  const created=await api.request('POST','/admin/product-intake/sessions',{clientDraftId:p.clientDraftId,submissionOperationKey:p.submissionOperationKey});p.intakeId=created.id;await save();
  let current=await api.request('GET',`/admin/product-intake/sessions/${p.intakeId}`);
  if(current.status!=='DRAFT')throw Error('Refusing to edit a nonpending intake');
  if(!p.metadataPatched){current=await api.request('PATCH',`/admin/product-intake/sessions/${p.intakeId}`,{expectedRevision:current.revision,mode:'NEW',selectedImageKey:p.clientImageId,approvedMetadata:{title:p.title,description:p.description,categoryId:p.categoryId,price:p.priceIqd},quantity:1,locationId:location.id});p.metadataPatched=true;await save();}
  const form=new FormData();form.set('clientImageId',p.clientImageId);form.set('file',new Blob([bytes],{type:'image/jpeg'}),`${p.n}-original.jpeg`);
  p.intake=await api.request('POST',`/admin/product-intake/sessions/${p.intakeId}/image`,form);
  p.duplicateReview=await api.request('GET',`/admin/product-intake/sessions/${p.intakeId}/duplicates`);await save();
  const endpoint=`/admin/product-intake/sessions/${p.intakeId}/enhancements`;
  const started=await api.request('POST',endpoint,{clientImageId:p.clientImageId,requestKey:p.autoRequestKey,mode:'NEURAL_BACKGROUND_REMOVE'});
  const jobId=started.jobs.find(x=>x.mode==='NEURAL_BACKGROUND_REMOVE').id;let status;
  for(let n=0;n<160;n++){status=await api.request('GET',endpoint);const job=status.jobs.find(x=>x.id===jobId);if(['COMPLETED','FAILED','CANCELLED'].includes(job.status)){p.automatic=job;break;}await new Promise(r=>setTimeout(r,500));}
  if(!p.automatic)throw Error('Automatic isolation still pending for '+p.n);
  if(p.automatic.candidate){const c=p.automatic.candidate;for(const kind of ['candidate','mask']){const v=await api.request('GET',`${endpoint}/candidates/${c.id}/preview?edge=1024&kind=${kind}`);const file=path.join(folder,`${String(p.n).padStart(2,'0')}-automatic-${kind}.webp`);await fs.writeFile(file,Buffer.from(v.base64,'base64'));}if(c.processingDetails?.sourceHash!==p.sourceRequestHash)throw Error('Original lineage verification failed');}
  await save();console.log(JSON.stringify({n:p.n,intakeId:p.intakeId,title:p.title,auto:p.automatic.status,error:p.automatic.errorCode,duplicates:p.duplicateReview.candidates.map(x=>({title:x.title,strong:x.strong})),sourcePreserved:p.originalSha256}));
 }
 await save();console.log('Six pending intake records imported. No product submit or publish performed.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
