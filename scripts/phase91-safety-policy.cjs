// Pure fail-closed policy for review/testing. No Docker/network/stop side effects.
const assert=require('node:assert/strict');
function assess(plan,metrics,containers){
 const valid=typeof plan.project==='string'&&/^rezona-p91-[a-f0-9]{8}$/.test(plan.project)&&
  Array.isArray(plan.allowedIds)&&plan.allowedIds.length>0&&containers.length===plan.allowedIds.length&&
  containers.every(c=>plan.allowedIds.includes(c.id)&&c.project===plan.project&&c.name.startsWith(plan.project+'-'));
 if(!valid)return{action:'ESCALATE_WITHOUT_CONTAINER_ACTION',reason:'IDENTITY_OR_SCOPE_INVALID',ids:[]};
 const stop=reason=>({action:'STOP_OWNED_STAGING_ONLY',reason,ids:[...plan.allowedIds]});
 if(!Number.isFinite(plan.minAvailableBytes)||!Number.isFinite(plan.minDiskFreeBytes)||!Number.isFinite(plan.maxStageDataBytes))return stop('UNAPPROVED_THRESHOLDS');
 if(!metrics||!Number.isFinite(metrics.availableBytes)||!Number.isFinite(metrics.diskFreeBytes)||!Number.isFinite(metrics.stageDataBytes)||metrics.productionReady!==true)return stop('MISSING_TELEMETRY_OR_PRODUCTION_NOT_READY');
 if(metrics.availableBytes<plan.minAvailableBytes)return stop('HOST_MEMORY_RESERVE');
 if(metrics.diskFreeBytes<plan.minDiskFreeBytes)return stop('HOST_DISK_RESERVE');
 if(metrics.stageDataBytes>plan.maxStageDataBytes)return stop('STAGING_DATA_BOUND');
 if(metrics.oomEvents>0||metrics.stagingRestarts>0)return stop('STAGING_OOM_OR_UNEXPECTED_RESTART');
 if(metrics.externalDispatch!==false)return stop('PAID_OR_EXTERNAL_DISPATCH_NOT_PROVEN_OFF');
 if(metrics.storageHealthy!==true||metrics.redisPersistenceHealthy!==true)return stop('STAGING_DEPENDENCY_OR_PERSISTENCE_FAILURE');
 return{action:'CONTINUE_OBSERVATION',reason:'WITHIN_PROVISIONAL_GUARDS',ids:[]};
}
module.exports={assess};
if(require.main===module){
 const project='rezona-p91-1234abcd',plan={project,allowedIds:['owned-a','owned-b'],minAvailableBytes:6*2**30,minDiskFreeBytes:64*2**30,maxStageDataBytes:12*2**30};
 const containers=plan.allowedIds.map((id,i)=>({id,project,name:project+'-'+i}));
 const good={availableBytes:8*2**30,diskFreeBytes:100*2**30,stageDataBytes:2*2**30,productionReady:true,oomEvents:0,stagingRestarts:0,externalDispatch:false,storageHealthy:true,redisPersistenceHealthy:true};
 const tests=[];const check=(name,p,m,c,action)=>{const x=assess(p,m,c);assert.equal(x.action,action,name);assert.ok(x.ids.every(id=>plan.allowedIds.includes(id)));tests.push({name,passed:true});};
 check('within provisional guards',plan,good,containers,'CONTINUE_OBSERVATION');
 for(const [name,delta]of[['low memory',{availableBytes:plan.minAvailableBytes-1}],['low host disk',{diskFreeBytes:plan.minDiskFreeBytes-1}],['staging disk bound',{stageDataBytes:plan.maxStageDataBytes+1}],['prod readiness',{productionReady:false}],['missing readiness',{productionReady:undefined}],['OOM',{oomEvents:1}],['unexpected restart',{stagingRestarts:1}],['paid enabled',{externalDispatch:true}],['unknown dispatch',{externalDispatch:undefined}],['S3 failure',{storageHealthy:false}],['AOF failure',{redisPersistenceHealthy:false}],['missing memory',{availableBytes:NaN}]])check(name,plan,{...good,...delta},containers,'STOP_OWNED_STAGING_ONLY');
 check('unapproved thresholds',{...plan,minAvailableBytes:null},good,containers,'STOP_OWNED_STAGING_ONLY');
 check('wrong project',plan,good,[{...containers[0],project:'aboessa'},containers[1]],'ESCALATE_WITHOUT_CONTAINER_ACTION');
 check('wrong container ID',plan,good,[{...containers[0],id:'production-api'},containers[1]],'ESCALATE_WITHOUT_CONTAINER_ACTION');
 check('wrong name',plan,good,[{...containers[0],name:'aboessa-api-1'},containers[1]],'ESCALATE_WITHOUT_CONTAINER_ACTION');
 check('unknown extra container',plan,good,[...containers,{id:'production',project:'aboessa',name:'aboessa-api-1'}],'ESCALATE_WITHOUT_CONTAINER_ACTION');
 console.log(JSON.stringify({passed:true,tests,sideEffects:0,deployed:false,actualAlertDelivery:false,thresholds:'PROVISIONAL_DESIGN_NOT_APPROVED_PRODUCTION_SLO'}));
}
