// Consolidates existing measurements. No SSH, Docker mutation or provider calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/benchmarks/phase91-envelope/786dbfa4');
const read=n=>JSON.parse(fs.readFileSync(path.join(out,n),'utf8')),save=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2),{flag:'wx'});
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const measurements=read('cgroup-final.json').map(x=>({service:x.name.split('-').slice(-2,-1)[0],
 peakBytes:Number(x.output.match(/memory.peak\n(\d+)/)[1]),memoryMaxBytes:Number(x.output.match(/memory.max\n(\d+)/)[1]),
 swapMaxBytes:Number(x.output.match(/memory.swap.max\n(\d+)/)[1]),cpuMax:x.output.match(/cpu.max\n([^\n]+)/)[1],
 oomKills:Number(x.output.match(/oom_kill (\d+)/)[1]),throttledPeriods:Number(x.output.match(/nr_throttled (\d+)/)[1])}));
const defs=read('enforced-local-definitions.json');assert.ok(defs.every(d=>d.networks.length===1&&d.networks[0]==='rezona-p91-786dbfa4_isolated'&&Object.keys(d.ports||{}).length===0&&d.limits.memory===d.limits.memorySwap));
const result=spawnSync(process.execPath,[path.join(root,'scripts/phase91-safety-policy.cjs')],{windowsHide:true,encoding:'utf8'});assert.equal(result.status,0);save('stop-policy-tests.json',JSON.parse(result.stdout));
const live=JSON.parse(fs.readFileSync(path.join(root,'docs/benchmarks/phase91-host/5082d84f/database.json'),'utf8'));
const db=JSON.parse(live.output),migrations=fs.readdirSync(path.join(root,'prisma/migrations')).filter(id=>fs.existsSync(path.join(root,'prisma/migrations',id,'migration.sql'))).sort();
const mismatch=db.migrations.filter(m=>sha(path.join(root,'prisma/migrations',m.migration_name,'migration.sql'))!==m.checksum);
save('live-baseline-revalidated.json',{observedAt:live.at,applied:db.migrations.length,source:migrations.length,pending:migrations.filter(id=>!db.migrations.some(m=>m.migration_name===id)),historicalMismatches:mismatch,disposition:'UNRESOLVED_NOT_APPROVED_NO_REPAIR',counts:{products:db.products,orders:db.orders,auctions:db.auctions,customers:db.customers,fileAssets:db.fileAssets,walletEntries:db.walletEntries},productionWrites:0});
const row=(service,mib,cpus,status)=>({service,memoryMiB:mib,cpuCores:cpus,status});
save('provisional-resource-envelope.json',{kind:'MEASURED_LOCAL_STARTING_ENVELOPE_NOT_HOST_PROVISIONING_AUTHORIZATION',services:[row('api_and_in_process_workers',1024,1,'LOCAL_ENFORCED_WORKLOAD_PASS'),row('postgres',512,.5,'LOCAL_ENFORCED_SYNTHETIC_MIGRATION_RESTORE_PASS'),row('redis',128,.25,'LOCAL_ENFORCED_PASS_MAXMEMORY_64M_NOEVICTION'),row('silo',768,.5,'LOCAL_ENFORCED_SYNTHETIC_MEDIA_PASS'),row('temporary_probe_slot',512,.5,'LOCAL_PROBE_CAPPED_NOT_PEAK_MEASURED'),row('future_https_gateway',128,.15,'UNTESTED_PROVISIONAL_BUDGET_ONLY'),row('future_watchdog_monitor',128,.1,'UNTESTED_RUNTIME_BUDGET_PURE_POLICY_TESTED')],steadyServicesMiB:2432,steadyServicesCpuCores:2.25,aggregateWithAllReservedSlotsMiB:3200,aggregateWithAllReservedSlotsCpuCores:3,measurements,
 disk:{dedicatedDataFilesystemGiB:16,imageAndTransferBudgetGiB:4,restrictedRecoveryBudgetGiB:2,logPolicyPerService:'5MiB x2, local driver',dataHardQuota:'NOT_ENFORCED_LOCAL_OR_REMOTE',aggregateIoReadMiBs:null,aggregateIoWriteMiBs:null,ioStatus:'ACTUAL_REQUIREMENT_AND_THROTTLE_REHEARSAL_REQUIRED_NO_INVENTED_SAFE_IO_RATE',localMeasuredDataKiB:read('local-data-footprint.json')},
 reserve:{hostPhysicalBytes:12541472768,planningRemainderAtAggregateHardLimitBytes:12541472768-3200*2**20,minHostAvailableGuardBytes:6*2**30,minHostDiskFreeGuardBytes:64*2**30,stagingDataStopGuardBytes:12*2**30,qualification:'Guard values are conservative provisional design choices, NOT observed production peaks or accepted SLOs. Production remains uncapped; reserve is not a kernel guarantee.'},
 queue:{localImageVariantsConcurrency:1,localEnhancementConcurrency:1,neuralSegmentation:false,paidDispatch:false,noBulkOrAutomaticRegeneration:true},
 stopPolicy:{pureTestsPassed:JSON.parse(result.stdout).tests.length,installed:false,hostAutomaticStopsTested:false,alertDelivery:false,allowedAction:'Exact reviewed staging IDs/project only; never production, no volume deletion'},
 sameServerSafetyGate:'FAIL_HARD_DISK_IO_RESERVE_ISOLATION_AND_WATCHDOG_NOT_ACCEPTED',remoteContainersCreated:0});
// Preserve old canonical report before its explicitly requested Phase91 update.
const old=path.join(root,'docs/rezona-protected-staging-acceptance.md'),archived=path.join(out,'prior-staging-acceptance-0f3e402b.md');
assert.equal(sha(old),'29564b07c1e4f29747d2b5162ba9f3caf4fa72fde63ab0a844d92b9cb55466b2');
fs.copyFileSync(old,archived,fs.constants.COPYFILE_EXCL);
save('prior-report-preserved.json',{originalPath:'docs/rezona-protected-staging-acceptance.md',archivePath:'docs/benchmarks/phase91-envelope/786dbfa4/prior-staging-acceptance-0f3e402b.md',sha256:sha(old),archiveHash:sha(archived),reason:'Owner explicitly requests updating canonical staging report; prior sealed content preserved byte-for-byte in fresh namespace. Original seal files are not modified.'});
console.log(JSON.stringify({measurements,policyTests:JSON.parse(result.stdout).tests.length,liveMigrations:db.migrations.length,pending:migrations.length-db.migrations.length,historyMismatches:mismatch.length,archivedOldReport:true,remoteProvisioning:false}));
