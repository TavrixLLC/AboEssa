// LOCAL CONCEPT ONLY. No provider credentials, inference, deployment, publishing or DB writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='D:/rezona-phase7-3-1-qa',manifestPath=path.join(base,'local-manifest.json'),mode=process.argv[2];
const sha=b=>createHash('sha256').update(b).digest('hex');let networkAttempts=0;
global.fetch=()=>{networkAttempts++;throw Error('PHASE731_NO_EXTERNAL_REQUESTS_AUTHORIZED');};
const old=JSON.parse(fs.readFileSync('D:/rezona-phase7-3-qa/pilot-manifest.json','utf8'));
const oldResult=JSON.parse(fs.readFileSync(path.join(old.dir,'pilot-result.json'),'utf8'));
assert.equal(oldResult.realRequests,3);assert.equal(oldResult.stoppedAfterUnknown,true);
if(mode==='prepare'){
 if(fs.existsSync(manifestPath))throw Error('No automatic recreation or overwrite');fs.mkdirSync(base,{recursive:true});
 const id='20261122-'+randomUUID().slice(0,8),dir=path.join(base,id),out=path.join(root,'docs/benchmarks/phase7-3-1',id);fs.mkdirSync(dir);fs.mkdirSync(out,{recursive:true});
 const historical=fs.readdirSync(old.out).filter(n=>/\.(json|md|log)$/.test(n)).map(n=>{const file=path.join(old.out,n),b=fs.readFileSync(file);return{file,bytes:b.length,sha256:sha(b)};});
 const protectedSources=['src/product-intake/product-intake.service.ts','src/image-enhancement/enhancement-selection.ts','src/sales/sales.service.ts','src/ai/recognition-budget.service.ts'];
 const businessBaseline=protectedSources.filter(n=>fs.existsSync(path.join(root,n))).map(n=>({file:n,sha256:sha(fs.readFileSync(path.join(root,n)))}));
 const dist=path.join(dir,'dist'),r=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.build.json'),'--outDir',dist,'--incremental','false'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024});
 if(r.status!==0){fs.writeFileSync(path.join(out,'prepare-typecheck.log'),(r.stdout??'')+(r.stderr??''),{flag:'wx'});throw Error('LOCAL_CONCEPT_BUILD_FAILED');}
 const m={id,dir,out,dist,createdAt:new Date().toISOString(),timezone:'Asia/Baghdad',externalAiCallsAuthorized:0,photos:old.photos,oldPilot:old.id,historical,businessBaseline};
 fs.writeFileSync(manifestPath,JSON.stringify(m,null,2),{flag:'wx'});fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(m,null,2),{flag:'wx'});console.log(JSON.stringify({prepared:true,id,dir,out,networkAttempts}));process.exit(0);
}
if(mode!=='previews')throw Error('Invalid local mode');const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));assert.match(m.id,/^20261122-[a-f0-9]{8}$/);assert.equal(path.resolve(m.dir),path.resolve(base,m.id));
if(fs.existsSync(path.join(m.dir,'local-concepts.json')))throw Error('No-overwrite local preview run');
process.env.NODE_PATH=m.dist+path.delimiter+path.join(root,'node_modules');require('node:module').Module._initPaths();
const {TABLETOP_STYLES}=require(path.join(m.dist,'src/image-enhancement/brand-studio.config.js')),{isolatedEnhancement}=require(path.join(m.dist,'src/image-enhancement/enhancement-isolate.js'));
const {falStudioRequest}=require(path.join(m.dist,'src/image-enhancement/fal-studio.provider.js')),sharp=require('sharp');
const write=(name,b)=>fs.writeFileSync(path.join(m.dir,name),Buffer.isBuffer(b)?b:JSON.stringify(b,null,2),{flag:'wx'});
(async()=>{
 const rows=[],prompts=[];
 for(const p of m.photos){
  const prefix='product-'+p.n,oldPrefix='clean_table_v1-'+p.n;
  const original=fs.readFileSync(path.join(old.dir,oldPrefix+'-original.jpeg')),mask=fs.readFileSync(path.join(old.dir,oldPrefix+'-mask.png')),neutral=fs.readFileSync(path.join(old.dir,oldPrefix+'-local-neutral.png'));
  assert.equal(sha(original),p.originalSha256);assert.equal(sha(mask),p.maskHash);
  write(prefix+'-original.jpeg',original);write(prefix+'-approved-mask.png',mask);write(prefix+'-existing-neutral.png',neutral);
  const concepts=[];
  for(const s of TABLETOP_STYLES){
   const stem=prefix+'-'+s.profile.name.replace('REZONA_STYLE_','').toLowerCase();
   const output=await isolatedEnhancement({bytes:original,mime:'image/jpeg',mask,mode:'GEMINI_BRAND_STUDIO',background:'WHITE',matting:false,studioProfile:s.profile,placement:{camera:'TOP_DOWN',quarterTurns:0,horizontal:.5}});
   assert.equal(output.details.opaqueRgbMismatches,0);write(stem+'-LOCAL-CONCEPT.png',output.png);write(stem+'-preserved-foreground.png',output.foreground);
   const geometry=output.details.placement,request=falStudioRequest(output.providerInput,s.profile,geometry);delete request.image_urls;
   const prompt={sourceNumber:p.n,styleId:s.profile.name,promptVersion:s.profile.promptVersion,placementRecipe:geometry.recipe,executed:false,modelIntendedOnly:'google/nano-banana-lite/edit',...request,imageInput:'NOT ATTACHED OR SENT'};
   prompts.push(prompt);write(stem+'-prompt-NOT-EXECUTED.json',prompt);
   const row={n:p.n,style:s.profile.name,label:s.label,file:stem+'-LOCAL-CONCEPT.png',localConcept:true,notFalOutput:true,employeeApproval:'PENDING',details:output.details,metrics:output.metrics};concepts.push(row);rows.push(row);
   console.log(JSON.stringify({n:p.n,style:s.profile.name,edge:geometry.canvasEdge,scale:geometry.productScale,rotation:geometry.clockwiseRotationDegrees,opaquePixels:output.details.preparedOpaquePixels,rgbMismatches:0,externalCalls:0}));
  }
  const panel=async b=>sharp(b).resize(480,480,{fit:'contain',background:'#EEEDE8'}).png().toBuffer(),label=t=>Buffer.from(`<svg width="500" height="80"><rect width="500" height="80" fill="#111818"/><text x="16" y="44" font-family="Arial" font-size="19" fill="#E7BC61">${t}</text></svg>`);
  const images=[original,neutral,...concepts.map(c=>fs.readFileSync(path.join(m.dir,c.file)))],labels=['A Original - unchanged','B Existing local neutral','C Clean Table - LOCAL CONCEPT','D Warm Premium - LOCAL CONCEPT','E Modern Soft - LOCAL CONCEPT'];
  const layers=[];for(let i=0;i<5;i++){layers.push({input:label(labels[i]),left:i*500,top:0},{input:await panel(images[i]),left:i*500+10,top:90});}
  write(prefix+'-A-to-E-comparison.jpg',await sharp({create:{width:2500,height:620,channels:3,background:'#111818'}}).composite(layers).jpeg({quality:94}).toBuffer());
  const first=concepts[0].details.placement;
  const roi=p.n===1?{left:555,top:285,width:220,height:320}:{left:700,top:330,width:210,height:300};
  const labelLayers=[],edgeLayers=[];
  for(let i=0;i<concepts.length;i++){
   const c=concepts[i],g=c.details.placement,image=fs.readFileSync(path.join(m.dir,c.file)),box={left:g.foregroundOrigin.x+roi.left-g.sourceMaskBox.left,top:g.foregroundOrigin.y+roi.top-g.sourceMaskBox.top,width:roi.width,height:roi.height};
   const crop=await sharp(image).extract(box).resize(420,640,{fit:'contain',background:'#F8F6F1',kernel:'nearest'}).png().toBuffer();
   labelLayers.push({input:label(['Clean - same real label','Warm - same real label','Modern - same real label'][i]),left:i*500,top:0},{input:crop,left:i*500+40,top:80});
   const edge={left:g.foregroundOrigin.x+Math.floor(g.rotatedSize.width*.40),top:g.contact.y-24,width:Math.min(180,Math.floor(g.rotatedSize.width*.30)),height:96};
   const zoom=await sharp(image).extract(edge).resize(480,300,{fit:'contain',background:'#F8F6F1',kernel:'nearest'}).png().toBuffer();
   edgeLayers.push({input:label(['Clean contact edge','Warm contact edge','Modern contact edge'][i]),left:i*500,top:0},{input:zoom,left:i*500+10,top:85});
  }
  write(prefix+'-label-inspection.jpg',await sharp({create:{width:1500,height:740,channels:3,background:'#111818'}}).composite(labelLayers).jpeg({quality:96}).toBuffer());
  write(prefix+'-ground-edge-inspection.jpg',await sharp({create:{width:1500,height:420,channels:3,background:'#111818'}}).composite(edgeLayers).jpeg({quality:96}).toBuffer());
  if(p.n===1){const rotated=await isolatedEnhancement({bytes:original,mime:'image/jpeg',mask,mode:'GEMINI_BRAND_STUDIO',background:'WHITE',matting:false,studioProfile:TABLETOP_STYLES[0].profile,placement:{camera:'TOP_DOWN',quarterTurns:3,horizontal:.5}});
   write(prefix+'-rotation-OPTION-NOT-SELECTED.png',rotated.png);write(prefix+'-rotation-option-proof.json',{notSelected:true,notEmployeeApproved:true,details:rotated.details});}
 }
 assert.equal(networkAttempts,0);for(const h of m.historical)assert.equal(sha(fs.readFileSync(h.file)),h.sha256);
 const report={createdAt:new Date().toISOString(),rows,networkAttempts,externalAiCalls:0,promptsExecuted:false,originalPhotosUnchanged:true,approvedMasksUnchanged:true,priorEvidenceUnchanged:true,allEmployeeApprovals:'PENDING',allPhotosPrivateLocalFilesOnly:true};
 write('local-concepts.json',report);for(const[name,value]of[['local-concepts.json',report],['prepared-prompts-NOT-EXECUTED.json',prompts]])fs.writeFileSync(path.join(m.out,name),JSON.stringify(value,null,2),{flag:'wx'});
 const html='<!doctype html><meta charset="utf-8"><title>REZONA LOCAL CONCEPT review</title><style>body{background:#101616;color:#EEE;font:16px Arial;max-width:1600px;margin:32px auto;padding:16px}img{max-width:100%;height:auto;border-radius:8px}a{color:#E7BC61}.warn{color:#E7BC61}h2{margin-top:48px}</style><h1>REZONA — LOCAL CONCEPT ONLY</h1><p class="warn">No fal requests. No automatic image approval, replacement or publication. All product foregrounds remain real captured pixels.</p><p>Both packages are treated as lying near-overhead views for concept review. No perspective is invented. Native scale 1; original rotation retained.</p>'+m.photos.map(p=>`<h2>${p.title}</h2><p>A original · B existing neutral · C Clean Table · D Warm Premium · E Modern Soft. C/D/E are deterministic LOCAL CONCEPTS, not fal output.</p><a href="product-${p.n}-A-to-E-comparison.jpg"><img src="product-${p.n}-A-to-E-comparison.jpg"></a><h3>Actual label inspection</h3><img src="product-${p.n}-label-inspection.jpg"><h3>Contact edge and support</h3><img src="product-${p.n}-ground-edge-inspection.jpg">${p.n===1?'<h3>Optional quarter-turn — NOT SELECTED</h3><p>Pixel-permutation rotation example only; requires employee approval, not an automatic orientation fix.</p><a href="product-1-rotation-OPTION-NOT-SELECTED.png">View optional rotation</a>':''}`).join('');
 fs.writeFileSync(path.join(m.dir,'review.html'),html,{flag:'wx'});
 console.log(JSON.stringify({complete:true,localConcepts:rows.length,externalAiCalls:0,report:path.join(m.out,'local-concepts.json'),privateReview:path.join(m.dir,'review.html')}));
})().catch(e=>{const code=/^[A-Z0-9_]{1,100}$/.test(e?.message??'')?e.message:'LOCAL_CONCEPT_REQUIRES_REVIEW';fs.writeFileSync(path.join(m.out,'stopped-'+Date.now()+'.json'),JSON.stringify({code,networkAttempts,noPaidCalls:true}),{flag:'wx'});console.error(code);process.exitCode=1;});
