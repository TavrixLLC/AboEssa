// Local proposal validation and no-overwrite seal. Never creates infrastructure.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),mobile=path.resolve(root,'../AboEssaMobile');
const out=path.join(root,'docs/benchmarks/phase92-infrastructure/acc6c8d1');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const save=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2),{flag:'wx'});
const manifest=read(path.join(out,'manifest.json')),old=read(path.join(root,manifest.previousSeal.path));
assert.equal(sha(path.join(root,manifest.previousSeal.path)),manifest.previousSeal.sha256);
for(const item of [...old.entries,...old.helpers])assert.equal(sha(path.join(root,item.path)),item.sha256,item.path);
assert.equal(sha(path.join(root,manifest.priorReport.archived)),manifest.priorReport.sha256);
assert.equal(manifest.priorReport.sha256,old.currentReport.sha256);
const artifact=read(path.join(root,'docs/benchmarks/admin-production-hardening/130f0653/backend-image-artifact.json'));
const source=read(path.join(root,'docs/benchmarks/admin-production-hardening/130f0653/source-candidate-v2.json'));
const context=path.join(path.dirname(source.file),'linux-context-v2');let sourceFiles=0;
function compare(rel){const p=path.join(context,rel);if(fs.statSync(p).isDirectory())for(const n of fs.readdirSync(p))compare(rel+'/'+n);else{assert.equal(sha(path.join(root,rel)),sha(p),rel);sourceFiles++;}}
source.contents.forEach(compare);
const mobileBefore=read(path.join(root,'docs/benchmarks/admin-production-hardening/130f0653/source-current-1795542700106.json')).mobile.files;
for(const item of mobileBefore)assert.equal(sha(path.join(mobile,item.path)),item.sha256,item.path);
const plan=read(path.join(out,'infrastructure-proposal.json'));
assert.equal(plan.aggregateReservedMiB,plan.reuseMeasuredEnvelope.reduce((n,s)=>n+s.memoryMiB,0));
assert.equal(plan.aggregateCpuCores,plan.reuseMeasuredEnvelope.reduce((n,s)=>n+s.cpuCores,0));
assert.equal(plan.host.publicIp,null);assert.equal(plan.host.provider,null);assert.equal(plan.projectCreated,false);
assert.equal(plan.stagingVerdict,'FAIL_NOT_PROVISIONED');assert.equal(plan.productionVerdict,'NO_GO');
assert.equal(plan.host.minimumRamBytes,8*2**30);assert.equal(plan.diskPlanningGiB.totalAllocated,82);
assert.ok(plan.diskPlanningGiB.totalAllocated*2**30<plan.host.minimumSsdBytes);
const d=read(path.join(out,'digitalocean-public-quote.json')),l=read(path.join(out,'linode-public-catalog.json'));
// Compare integer cents/percentage units, not binary-floating currency values.
assert.equal(Math.round(d.baseMonthly*100)*(100+d.weeklyBackupPercent),Math.round(d.monthlyIncludingWeeklyBackup*100)*100);
assert.equal(d.ownerApproved,false);assert.equal(l.ownerApproved,false);assert.equal(l.vcpus,4);assert.equal(l.memoryMiB,8192);assert.equal(l.price.monthly,48);assert.equal(l.backupPrice.monthly,10);
const docs=['docs/rezona-phase-9-2-dedicated-staging.md','docs/rezona-protected-staging-acceptance.md'];let links=0;
for(const doc of docs){const text=fs.readFileSync(path.join(root,doc),'utf8');assert.ok(!/fal_sk_|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/.test(text));for(const m of text.matchAll(/\]\(([^)]+)\)/g)){if(/^https?:/.test(m[1])||/^[A-Za-z]:/.test(m[1]))continue;assert.ok(fs.existsSync(path.resolve(root,path.dirname(doc),m[1])),m[1]);links++;}}
save('final-validation.json',{at:new Date().toISOString(),timezone:'Asia/Baghdad',
 result:'INFRASTRUCTURE_PROPOSAL_READY__AWAITING_OWNER_HOST_OR_PROVISIONING_APPROVAL',staging:'FAIL_NOT_PROVISIONED',production:'NO_GO',
 sourceFilesUnchanged:sourceFiles,mobileBaselineFilesPreserved:mobileBefore.length,priorEvidenceEntriesUnchanged:old.entries.length,priorHelpersUnchanged:old.helpers.length,
 previousCanonicalReportArchived:manifest.priorReport,oldSealUnchanged:true,localLinksChecked:links,
 initialSizingCertified:false,publicPricingVerified:true,checkoutAvailabilityVerified:false,providerSelected:false,priceApproved:false,spareHostAnswer:'PENDING',
 fullStagingObjectiveComplete:false,previousLocalTestsRerun:0,productionConnections:0,productionWrites:0,purchases:0,resourcesProvisioned:0,
 paidInference:0,githubPush:false,apkBuild:false,deviceInstall:false,automaticPublishing:false,finalProductionGoRequested:false,
 nextStep:'Owner supplies a separate spare for read-only assessment, or approves exact provider/plan/region/checkout cost and staging-only provisioning/access scope.'});
const files=fs.readdirSync(out).sort().map(n=>({path:'docs/benchmarks/phase92-infrastructure/acc6c8d1/'+n,sha256:sha(path.join(out,n))}));
const helpers=['scripts/phase92-infrastructure.cjs','scripts/phase92-finalize.cjs'].map(n=>({path:n,sha256:sha(path.join(root,n))}));
save('evidence-seal.json',{at:new Date().toISOString(),kind:'HASH_INVENTORY_NOT_DIGITAL_SIGNATURE',files,helpers,
 docs:docs.map(n=>({path:n,sha256:sha(path.join(root,n))})),previousSeal:manifest.previousSeal,previousReport:manifest.priorReport,
 currentCanonicalUpdateAuthorizedBy:'Phase9.2 required deliverables',verdict:'NO_GO'});
console.log(JSON.stringify({sealed:true,proposalPrepared:true,sourceFilesUnchanged:sourceFiles,mobileFilesPreserved:mobileBefore.length,localLinksChecked:links,
 dedicatedHostProvided:false,purchased:false,provisioned:false,staging:'FAIL_NOT_PROVISIONED',production:'NO_GO'}));
