if(process.env.REZONA_PHASE71_QA!=='1')throw Error('Explicit Phase7.1 local QA only');
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),image=spawnSync('docker',['image','inspect','rezona-phase3-preproduction:local','--format','{{.Id}}'],{encoding:'utf8',windowsHide:true});
if(image.status!==0)throw Error('Local previously built QA image required; no automatic pull');
const args=['run','--rm','--network=none','--read-only','--memory=1g','--memory-swap=1g','--cpus=2','--pids-limit=64','--cap-drop=ALL','--security-opt=no-new-privileges','--tmpfs=/tmp:rw,noexec,nosuid,size=64m',
 '--mount',`type=bind,source=${path.join(root,'dist/src/image-enhancement')},target=/app/dist/src/image-enhancement,readonly`,
 '--mount',`type=bind,source=${path.join(root,'scripts/phase7-1-container-profile.cjs')},target=/driver.cjs,readonly`,
 '--mount','type=bind,source=D:/rezona-phase7-1-qa/runtime,target=/runtime,readonly',
 '--mount','type=bind,source=D:/rezona-phase7-1-qa/models,target=/models,readonly',
 '--mount','type=bind,source=D:/rezona-phase5-qa/physical-upload-original.jpg,target=/input.jpg,readonly',
 '-e','NODE_PATH=/app/node_modules','-e','REZONA_PHASE71_CONTAINER=1','--entrypoint','node',image.stdout.trim(),'/driver.cjs'];
const result=spawnSync('docker',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
const report={time:new Date().toISOString(),imageId:image.stdout.trim(),exitCode:result.status,error:result.error?.message,
 result:result.status===0?JSON.parse(result.stdout):null,stderr:result.stderr};
fs.writeFileSync(path.join(root,'docs/benchmarks/phase7-1/container-profile.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({exitCode:result.status,rows:report.result?.rows.length,success:report.result?.rows.filter(r=>r.ok).length,cgroupPeak:report.result?.cgroupMemoryPeakBytes,stderr:result.stderr.slice(-500)}));
if(result.status!==0)process.exitCode=1;
if(!report.result?.rows.some(r=>r.model==='u2netp'&&r.ok))process.exitCode=1;
