// No-overwrite evidence seal and preservation checks; no deployment capability.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),mobile=path.resolve(root,'../AboEssaMobile'),out=path.join(root,'docs/benchmarks/phase91-envelope/786dbfa4');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const save=(name,x)=>fs.writeFileSync(path.join(out,name),JSON.stringify(x,null,2),{flag:'wx'});
const archived='docs/benchmarks/phase91-envelope/786dbfa4/prior-staging-acceptance-0f3e402b.md';
const oldReport='docs/rezona-protected-staging-acceptance.md';
const preserved=[];
for(const [dir,name]of[['docs/benchmarks/admin-production-hardening/130f0653','evidence-seal.json'],['docs/benchmarks/phase9-release-review/0f3e402b','review-seal.json']]){
 const seal=JSON.parse(fs.readFileSync(path.join(root,dir,name)));
 for(const item of seal.evidence){assert.equal(sha(path.join(root,dir,item.path)),item.sha256,item.path);}
 const relocations=[];
 for(const item of seal.docs){const n=item.path===oldReport?archived:item.path;assert.equal(sha(path.join(root,n)),item.sha256,item.path);if(n!==item.path)relocations.push({canonical:item.path,preservedAt:n,sha256:item.sha256});}
 preserved.push({seal:dir+'/'+name,sha256:sha(path.join(root,dir,name)),referencedEvidenceUnchanged:true,priorReportContentPreserved:true,relocations});
}
const source=JSON.parse(fs.readFileSync(path.join(root,'docs/benchmarks/admin-production-hardening/130f0653/source-candidate-v2.json')));
const context=path.join(path.dirname(source.file),'linux-context-v2');let sourceFiles=0;
function compare(rel){const p=path.join(context,rel);if(fs.statSync(p).isDirectory())for(const n of fs.readdirSync(p))compare(rel+'/'+n);else{assert.equal(sha(path.join(root,rel)),sha(p),rel);sourceFiles++;}}
source.contents.forEach(compare);
const prior=JSON.parse(fs.readFileSync(path.join(root,'docs/benchmarks/admin-production-hardening/130f0653/source-current-1795542700106.json')));
for(const item of prior.mobile.files)assert.equal(sha(path.join(mobile,item.path)),item.sha256,item.path);
const report=fs.readFileSync(path.join(root,oldReport),'utf8');let links=0;
for(const m of report.matchAll(/\]\(([^)]+)\)/g)){if(/^https?:/.test(m[1])||/^[A-Za-z]:/.test(m[1]))continue;assert.ok(fs.existsSync(path.resolve(root,'docs',m[1])),m[1]);links++;}
const cgroups=JSON.parse(fs.readFileSync(path.join(out,'cgroup-final.json')));assert.equal(cgroups.length,4);assert.ok(cgroups.every(x=>/oom_kill 0/.test(x.output)&&/memory.swap.max\n0/.test(x.output)));
const stop=JSON.parse(fs.readFileSync(path.join(out,'stop-policy-tests.json')));assert.equal(stop.tests.length,18);assert.ok(stop.tests.every(x=>x.passed));
const plan=JSON.parse(fs.readFileSync(path.join(out,'provisional-resource-envelope.json')));assert.equal(plan.services.reduce((a,s)=>a+s.memoryMiB,0),3200);assert.equal(plan.services.reduce((a,s)=>a+s.cpuCores,0),3);assert.equal(plan.remoteContainersCreated,0);
save('final-validation.json',{at:new Date().toISOString(),timezone:'Asia/Baghdad',verdict:'STAGING_FAIL_SAFETY_HOLD__PRODUCTION_NO_GO',
 sourceFilesUnchanged:sourceFiles,mobileBaselineFilesUnchanged:prior.mobile.files.length,preserved,localLinksChecked:links,
 localResourceEnforcement:true,syntheticWorkload:true,localS3ScopedSubchecks:true,localSyntheticRecovery:true,stopPolicyTests:18,
 remoteStagingProvisioned:false,productionDataWrites:0,productionDeployments:0,productionRestarts:0,productionCredentialChanges:0,
 paidInference:0,githubPush:false,deviceInstall:false,automaticPublishing:false,unknownReservationsReleased:0,
 formalMigrationDisposition:'UNRESOLVED',historical19To40RehearsalThisPhase:false,httpsStaging:false,mfaAccepted:false,actualAlertsDelivered:false,
 blockingGates:['HARD_DISK_AND_IO_ENVELOPE','REPRESENTATIVE_PRODUCTION_RESERVE_AND_REMOTE_CGROUP_ENFORCEMENT','HOST_NETWORK_VOLUME_ISOLATION_AND_INDEPENDENT_WATCHDOG','FORMAL_MIGRATION_HISTORY_DISPOSITION','PROTECTED_HTTPS_MFA_AND_ALERT_RECIPIENT','MINOR_VERSION_PARITY_AND_OLD_CLIENT_DEVICE_RECOVERY_ACCEPTANCE'],
 nextDecision:'Prefer separate protected staging host; no same-server creation until an explicitly reviewed bounded design passes. No final production GO requested.'});
const entries=[];
for(const rel of['docs/benchmarks/phase91-host/5082d84f','docs/benchmarks/phase91-host/f13edf03','docs/benchmarks/phase91-host/158d63fa','docs/benchmarks/phase91-envelope/a9bfa554','docs/benchmarks/phase91-envelope/7f9397e1','docs/benchmarks/phase91-envelope/786dbfa4']){
 for(const n of fs.readdirSync(path.join(root,rel)).sort()){const file=path.join(root,rel,n);if(fs.statSync(file).isFile()){const s=fs.readFileSync(file,'utf8');assert.ok(!/fal_sk_|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/.test(s));entries.push({path:rel+'/'+n,sha256:sha(file)});}}
}
const helpers=fs.readdirSync(path.join(root,'scripts')).filter(n=>n.startsWith('phase91-')).sort().map(n=>({path:'scripts/'+n,sha256:sha(path.join(root,'scripts',n))}));
save('evidence-seal.json',{at:new Date().toISOString(),kind:'HASH_INVENTORY_NOT_DIGITAL_SIGNATURE',entries,helpers,currentReport:{path:oldReport,sha256:sha(path.join(root,oldReport))},previousSeals:preserved,verdict:'NO_GO'});
console.log(JSON.stringify({sealed:true,sourceFilesUnchanged:sourceFiles,mobileFilesPreserved:prior.mobile.files.length,evidenceFiles:entries.length,links,policyTests:18,remoteServicesCreated:0,verdict:'STAGING_FAIL_SAFETY_HOLD__PRODUCTION_NO_GO'}));
