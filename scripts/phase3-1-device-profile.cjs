// Local-only physical QA collector. Never operates on the ordinary app package.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const origin = 'http://127.0.0.1:58443';
const adb = 'C:/Users/3ma/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const pkg = 'com.tavrix.aboessa_customer_app.phase3qa';
const out = path.resolve(__dirname, '../docs/benchmarks/phase3-1');
const name = process.argv[2];
if (!/^(before|after|final|retained)-(profile|release|warm|coverage)-[1-5]$/.test(name || '')) throw Error('Explicit QA run name required');
const profile = name.includes('profile');
const shell = (...args) => execFileSync(adb, ['-s', '2b6f28b2', ...args], {encoding:'utf8', maxBuffer:16*1024*1024});
async function control(action, value) {
  const r = await fetch(origin+'/__phase3/control', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({action,value})});
  if (!r.ok) throw Error('QA control failed '+r.status);
  return r.json();
}
async function vmConnect() {
  const file = 'D:/rezona-phase3-validation-20261117/phase3-vm.json';
  let uri;
  for(let i=0;i<180;i++) {
    try { const raw=(await fs.readFile(file,'utf8')).trim(); uri=raw.startsWith('ws:') ? raw : JSON.parse(raw).uri; if(uri) break; } catch {}
    await sleep(1000);
  }
  if (!uri) throw Error('VM service file missing');
  const ws = new WebSocket(uri.startsWith('ws:') ? uri : uri.replace('http:','ws:')+'ws');
  await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail});
  let id=0; const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id && pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p[1](m.error):p[0](m.result)}};
  const call=(method,params={})=>new Promise((ok,fail)=>{const n=++id;pending.set(n,[ok,fail]);ws.send(JSON.stringify({jsonrpc:'2.0',id:n,method,params}))});
  await call('setVMTimelineFlags',{recordedStreams:['Dart','Embedder','GC']});
  const vm = await call('getVM');
  const isolate = vm.isolates.find(x=>x.name==='main') || vm.isolates[0];
  const info = await call('getIsolate',{isolateId:isolate.id});
  const enabled=[];
  for(const ext of ['ext.flutter.profileWidgetBuilds','ext.flutter.profileRenderObjectLayouts','ext.flutter.profileRenderObjectPaints']) {
    if(info.extensionRPCs?.includes(ext)) {await call(ext,{isolateId:isolate.id,enabled:'true'}); enabled.push(ext)}
  }
  return {call,ws,enabled};
}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  if(name.includes('coverage')) {
    // Only the extended assertion target changed (AuctionGridTile, not the
    // mixed-home AppCommerceCard). Retained production-code paths are identical.
    shell('install','-r','D:/rezona-phase3-validation-20261117/phase3-1-coverage-release.apk');
  }
  const count=(await (await fetch(origin+'/__phase3/results')).json()).length;
  await control('mode', name.includes('coverage') ? 'coverage' : name.includes('warm') ? 'warm' : 'cold');
  const environment={time:new Date().toISOString(),device:shell('shell','getprop','ro.product.model'),battery:shell('shell','dumpsys','battery'),thermal:shell('shell','dumpsys','thermalservice')};
  await fs.writeFile(path.join(out,name+'-environment.json'),JSON.stringify(environment,null,2));
  // Android's supported stdin configuration avoids cross-UID config-file access.
  execFileSync(adb,['-s','2b6f28b2','shell','perfetto','--background-wait','--txt','-c','-','-o',`/data/misc/perfetto-traces/rezona-${name}.trace`],
    {input:await fs.readFile(path.resolve(__dirname,'../docs/benchmarks/phase3-1-perfetto.pbtxt')),encoding:'utf8'});
  const traceStart=Date.now();
  let vm;
  if(profile) { console.log('READY: launch profile QA now'); vm=await vmConnect(); console.log('VM timeline enabled',vm.enabled); }
  else {
    shell('shell','am','force-stop',pkg);
    environment.launch=shell('shell','am','start','-W','-n',pkg+'/com.tavrix.aboessa_customer_app.MainActivity');
  }
  environment.pid=Number(shell('shell','pidof',pkg).trim());
  const display=[];
  const surfaceLatency=[];
  let result;
  for(let i=0;i<100;i++) {
    const entries=await (await fetch(origin+'/__phase3/results')).json();
    const snapshot=await control('snapshot');
    display.push({time:new Date().toISOString(),stage:snapshot.requests.at(-1)?.stage,display:shell('shell','dumpsys','display').split('\n').filter(l=>/mActiveModeId=|mActiveRenderFrameRate=|mOverrideDisplayInfo=/.test(l))});
    if(process.env.REZONA_CAPTURE_SURFACE === '1') {
    const layers=shell('shell','dumpsys','SurfaceFlinger','--list');
    const layer=layers.split('\n').filter(l=>l.includes(pkg)).map(l=>l.match(/SurfaceView\[.*?\]\(BLAST\)#\d+/)?.[0]).find(Boolean);
    if(layer) surfaceLatency.push({time:new Date().toISOString(),layer,raw:shell('shell',`dumpsys SurfaceFlinger --latency "${layer}"`)});
    }
    if(entries.length>count) {result=entries.at(-1);break}
    await sleep(1000);
  }
  await fs.writeFile(path.join(out,name+'.json'),JSON.stringify({name,environment,display,result},null,2));
  await fs.writeFile(path.join(out,name+'-surface-latency.json'),JSON.stringify(surfaceLatency,null,2));
  if(vm) {
    try { await fs.writeFile(path.join(out,name+'-timeline.json'),JSON.stringify(await vm.call('getVMTimeline'))); }
    catch(e) { await fs.writeFile(path.join(out,name+'-timeline-error.json'),JSON.stringify(e)); }
    try {
      const now=(await vm.call('getVMTimelineMicros')).timestamp;
      await fs.writeFile(path.join(out,name+'-cpu.json'),JSON.stringify(await vm.call('getCpuSamples',{isolateId:(await vm.call('getVM')).isolates.find(x=>x.name==='main').id,timeOriginMicros:Math.max(0,now-120000000),timeExtentMicros:120000000})));
    } catch(e) {console.log('CPU samples unavailable',e)}
    vm.ws.close();
  }
  console.log('RESULT',result?.finished,result?.error);
  console.log('STAGES',Object.entries(result||{}).filter(([k,v])=>v?.frames!==undefined).map(([k,v])=>[k,v.frames,v.buildP95Ms,v.rasterP95Ms,v.cacheEvents]));
  // Trace completes independently, avoiding a foreground blocking wait.
  await fs.writeFile(path.join(out,name+'-meminfo.txt'),shell('shell','dumpsys','meminfo',pkg));
  while(Date.now()-traceStart<66500) await sleep(1000);
  shell('pull',`/data/misc/perfetto-traces/rezona-${name}.trace`,path.join(out,name+'.perfetto-trace'));
  console.log('COLLECTED',name);
})().catch(e=>{console.error(e);process.exitCode=1});
