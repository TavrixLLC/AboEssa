const fs=require('node:fs');
const path=require('node:path');
const dir=path.resolve(__dirname,'../docs/benchmarks/phase3-1');
const p=(v,q)=>{v=[...v].sort((a,b)=>a-b);return v.length?v[Math.round((v.length-1)*q)]:null};
const stats=v=>({median:p(v,.5),min:Math.min(...v),max:Math.max(...v),mean:v.reduce((a,b)=>a+b,0)/v.length,stddev:Math.sqrt(v.reduce((s,x)=>s+(x-v.reduce((a,b)=>a+b,0)/v.length)**2,0)/v.length)});
const groups={};
for(const group of ['before','after','final','retained']) {
  const runs=fs.readdirSync(dir).filter(n=>new RegExp('^'+group+'-release-[1-5]\\.json$').test(n)).map(n=>JSON.parse(fs.readFileSync(path.join(dir,n))));
  if(!runs.length)continue;
  const stages={};
  for(const key of Object.keys(runs[0].result).filter(k=>runs[0].result[k]?.rawFramesUs)) {
    const samples=runs.map(r=>r.result[key]);
    const frames=samples.flatMap(s=>s.rawFramesUs);
    const cache={};
    for(const s of samples)for(const[k,v]of Object.entries(s.cacheEvents))cache[k]=(cache[k]||0)+v;
    const memoryDecisions=(cache.memoryHit||0)+(cache.memoryMiss||0)+(cache.pendingReuse||0);
    const completedFirstFiles=(cache.diskHit||0)+(cache.networkLoad||0);
    stages[key]={samples:samples.length,frames:frames.length,
      buildP50Ms:p(frames.map(f=>f[1]/1000),.5),buildP95Ms:p(frames.map(f=>f[1]/1000),.95),
      rasterP50Ms:p(frames.map(f=>f[2]/1000),.5),rasterP95Ms:p(frames.map(f=>f[2]/1000),.95),
      runBuildP95Ms:stats(samples.map(s=>s.buildP95Ms)),runRasterP95Ms:stats(samples.map(s=>s.rasterP95Ms)),
      over16667BuildOrRaster:frames.filter(f=>f[1]>16667||f[2]>16667).length,
      rssMiB:stats(samples.map(s=>s.memory.processRssBytes/1048576)),decodedMiB:stats(samples.map(s=>s.memory.decodedCacheBytes/1048576)),
      requests:stats(samples.map(s=>s.http.requests.length)),imageGets:samples.map(s=>s.http.requests.filter(r=>r.mime?.startsWith('image/')).length),
      bodyBytes:samples.map(s=>s.http.encodedBodyBytes),cache,
      memoryHitRate:memoryDecisions?(cache.memoryHit||0)/memoryDecisions:null,
      memoryDecisionDenominator:memoryDecisions,
      diskFirstHitRate:completedFirstFiles?(cache.diskHit||0)/completedFirstFiles:null,
      completedFileFirstSourceDenominator:completedFirstFiles,
    };
  }
  groups[group]={runs:runs.map(r=>({name:r.name,finished:r.result.finished,scrollRestored:r.result.scrollRestored,categorySelected:r.result.categorySelected,
    updatedImageDecoded:r.result.updatedImageDecoded,maxMountedCards:r.result.maxMountedCards,
    firstCardsMs:r.result.firstCardsFromEntrypointMs,firstImagesFromNavigationMs:r.result.firstImagesFromNavigationMs,
    battery:r.environment.battery.match(/level:.*|temperature:.*/g),modes:[...new Set((r.display||[]).flatMap(s=>s.display.filter(l=>l.includes('mActiveRenderFrameRate='))).map(s=>s.trim()))]})),stages};
}
fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(groups,null,2));
const rows=['| Scenario | Before build P50/P95 | Final build P50/P95 | Before raster P50/P95 | Final raster P50/P95 |','|---|---:|---:|---:|---:|'];
for(const[k,b]of Object.entries(groups.before?.stages||{})) {
  const a=groups.retained?.stages[k];
  const fmt=(v,kind)=>v?`${v[kind+'P50Ms'].toFixed(2)} / ${v[kind+'P95Ms'].toFixed(2)}`:'pending';
  rows.push(`| ${k} | ${fmt(b,'build')} | ${fmt(a,'build')} | ${fmt(b,'raster')} | ${fmt(a,'raster')} |`);
}
fs.writeFileSync(path.join(dir,'comparison.md'),rows.join('\n')+'\n');
console.log(rows.join('\n'));
