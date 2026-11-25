// Release preparation only. Never cuts over, migrates production, installs an app or loads fal keys.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash,randomUUID}=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),mobile=path.resolve(root,'../AboEssaMobile'),base='D:/rezona-admin-release',pointer=path.join(base,'active.json');
const sha=b=>createHash('sha256').update(b).digest('hex');
const run=(cmd,args,cwd=root)=>spawnSync(cmd,args,{cwd,env:{...process.env,npm_config_fetch_timeout:'15000',npm_config_fetch_retries:'0'},encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:32*1024*1024});
const write=(file,value)=>fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2),{flag:'wx'});
function snapshot(repo){const git=run('git',['ls-files','--cached','--others','--exclude-standard','-z'],repo);assert.equal(git.status,0);const names=[...new Set(git.stdout.split('\0').filter(Boolean))];
 const safe=n=>!/(^|\/)(node_modules|build|\.dart_tool|backups|uploads|\.git|tools)(\/|$)/.test(n)&&!/(^|\/)(\.env(?:\..*)?|key\.properties|local\.properties)$/.test(n)&&!(/\.(?:jks|keystore|p12|pem|key|dpapi)$/.test(n));
 return {head:run('git',['rev-parse','HEAD'],repo).stdout.trim(),branch:run('git',['branch','--show-current'],repo).stdout.trim(),status:run('git',['status','--porcelain=v1'],repo).stdout.split(/\r?\n/).filter(Boolean),files:names.filter(safe).filter(n=>fs.existsSync(path.join(repo,n))&&fs.statSync(path.join(repo,n)).isFile()).map(n=>({path:n,sha256:sha(fs.readFileSync(path.join(repo,n)))}))};}
(async()=>{
 const mode=process.argv[2];
 if(mode==='init'){
  const id=randomUUID().slice(0,8),dir=path.join(base,'run-'+id),out=path.join(root,'docs/benchmarks/admin-production-release',id);fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(out,{recursive:true});
  const manifest={id,dir,out,at:new Date().toISOString(),timezone:'Asia/Baghdad',proposedVersion:'1.1.0+3',cutoverAuthorized:false,customerRelease:false};
  write(path.join(dir,'manifest.json'),manifest);write(path.join(out,'source-before.json'),{backend:snapshot(root),mobile:snapshot(mobile)});fs.mkdirSync(base,{recursive:true});write(pointer,{manifest:path.join(dir,'manifest.json')});console.log(JSON.stringify(manifest));return;
 }
 const m=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(pointer,'utf8')).manifest,'utf8'));
 if(mode==='audit'){
  for(const omit of[false,true]){
   const at=Date.now(),r=run('cmd.exe',['/d','/s','/c',`npm audit --json${omit?' --omit=dev':''}`]);let value;try{value=JSON.parse(r.stdout);}catch{value={error:'AUDIT_UNAVAILABLE',exitCode:r.status};}
   write(path.join(m.out,(omit?'npm-audit-production-':'npm-audit-all-')+at+'.json'),value);console.log(JSON.stringify({omitDev:omit,exitCode:r.status,metadata:value.metadata??null,error:value.error??null}));
  }return;
 }
 if(mode==='public'){
  const origin='https://shanasheel.tavrixllc.com',rows=[];
  for(const url of['/health','/ready','/api/products?limit=1','/api/auctions?limit=1','/api/admin/overview','/api/admin/product-intake/studio-review','/api/docs']){
   const started=Date.now();try{const r=await fetch(origin+url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{origin:'https://untrusted-origin.invalid'}});await r.body?.cancel();rows.push({path:url,status:r.status,elapsedMs:Date.now()-started,headers:Object.fromEntries(['strict-transport-security','x-content-type-options','content-security-policy','access-control-allow-origin','access-control-allow-credentials','cache-control','server'].map(k=>[k,r.headers.get(k)]))});}catch(e){rows.push({path:url,error:e.cause?.code??e.code??e.name,elapsedMs:Date.now()-started});}
  }
  write(path.join(m.out,'production-public-readonly-'+Date.now()+'.json'),{at:new Date().toISOString(),origin,authenticated:false,mutations:0,customerPayloadStored:false,rows});console.log(JSON.stringify(rows));return;
 }
 if(mode==='snapshot'){write(path.join(m.out,'source-current-'+Date.now()+'.json'),{backend:snapshot(root),mobile:snapshot(mobile)});return;}
 throw Error('UNKNOWN_MODE');
})().catch(e=>{console.error(e.message);process.exitCode=1});
