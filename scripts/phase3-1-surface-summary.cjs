// SurfaceFlinger FrameTracker columns: desired, actual present, frame ready (ns).
// No displayed-jank percentage is inferred from engine timings or script gaps.
const fs=require('node:fs');
const path=require('node:path');
const dir=path.resolve(__dirname,'../docs/benchmarks/phase3-1');
const q=(a,p)=>{a=[...a].sort((a,b)=>a-b);return a.length?a[Math.round((a.length-1)*p)]:null};
const output={};
for(const name of fs.readdirSync(dir).filter(n=>/^(retained)-(warm|coverage)-\d-surface-latency.json$/.test(n))) {
  const samples=JSON.parse(fs.readFileSync(path.join(dir,name)));
  const result=JSON.parse(fs.readFileSync(path.join(dir,name.replace('-surface-latency','')))).result;
  const unique=new Map();
  const periods=new Set();
  for(const sample of samples){
    const lines=sample.raw.trim().split(/\r?\n/);
    periods.add(Number(lines.shift()));
    for(const line of lines){
      const v=line.trim().split(/\s+/).map(Number);
      if(v.length!==3||!v.every(x=>Number.isSafeInteger(x)&&x>0))continue;
      unique.set(sample.layer+'/'+v.join('/'),v);
    }
  }
  const rows=[...unique.values()].sort((a,b)=>a[1]-b[1]);
  const perStage={};
  for(const[k,v]of Object.entries(result)) {
    if(!v?.rawFramesUs?.length)continue;
    const lo=v.rawFramesUs[0][0]*1000, hi=v.rawFramesUs.at(-1)[0]*1000+20000000;
    const matches=rows.filter(r=>r[0]>=lo&&r[0]<=hi);
    const latency=matches.map(r=>(r[1]-r[0])/1e6);
    perStage[k]={presentationRecords:matches.length,desiredToActualP50Ms:q(latency,.5),desiredToActualP95Ms:q(latency,.95)};
  }
  output[name]={snapshots:samples.length,uniquePresentationRecords:rows.length,reportedPeriodsNs:[...periods],
    association:'monotonic desired-present timestamp in stage raw-frame window; not one-to-one engine frame mapping',
    perStage,
    allDesiredToActualP50Ms:q(rows.map(r=>(r[1]-r[0])/1e6),.5),allDesiredToActualP95Ms:q(rows.map(r=>(r[1]-r[0])/1e6),.95),
    allInterPresentP95Ms:q(rows.slice(1).map((r,i)=>(r[1]-rows[i][1])/1e6),.95),
    warning:'inter-present gaps include intentional scripted pauses; not displayed-jank rate'};
}
fs.writeFileSync(path.join(dir,'surface-summary.json'),JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
