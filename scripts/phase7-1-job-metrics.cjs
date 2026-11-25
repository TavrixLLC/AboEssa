if(process.env.REZONA_PHASE71_QA!=='1')throw Error('Explicit local Phase7.1 QA only');
const {PrismaClient}=require('@prisma/client'),fs=require('node:fs/promises'),path=require('node:path');
const db=new PrismaClient({datasources:{db:{url:'postgresql://phase71_qa:phase71-local-only@127.0.0.1:55452/rezona_phase71_qa'}}});
const q=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.max(0,Math.ceil(xs.length*p)-1)];
(async()=>{const rows=await db.productImageEnhancementJob.findMany({where:{mode:'NEURAL_BACKGROUND_REMOVE',model:'u2net',status:'COMPLETED'},orderBy:{createdAt:'desc'},take:50,select:{createdAt:true,completedAt:true,metrics:true}});
const durations=rows.map(r=>r.completedAt-r.createdAt),processing=rows.map(r=>r.metrics.totalMs);
const out={time:new Date().toISOString(),scope:'Most recent <=50 completed full-model jobs in dedicated Phase71 HTTP QA, including intentional restart/concurrency cases. Not independent photos or production latency.',count:rows.length,queueToCompletionP50Ms:q(durations,.5),queueToCompletionP95Ms:q(durations,.95),claimedProcessingP50Ms:q(processing,.5),claimedProcessingP95Ms:q(processing,.95),rows};
await fs.writeFile(path.join(__dirname,'../docs/benchmarks/phase7-1/http-job-metrics.json'),JSON.stringify(out,null,2));console.log(JSON.stringify({...out,rows:undefined}));})().finally(()=>db.$disconnect()).catch(e=>{console.error(e.message);process.exitCode=1;});
