// Proposal/evidence only. No provider account, purchase, SSH, provisioning,
// Docker mutation, secrets, inference, migration or device operations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
async function main(){
 const id=randomUUID().slice(0,8),out=path.join(root,'docs/benchmarks/phase92-infrastructure',id);
 fs.mkdirSync(out,{recursive:true});
 const save=(name,x)=>fs.writeFileSync(path.join(out,name),JSON.stringify(x,null,2),{flag:'wx'});
 const previous=path.join(root,'docs/benchmarks/phase91-envelope/786dbfa4'),seal=read(path.join(previous,'evidence-seal.json'));
 for(const item of [...seal.entries,...seal.helpers])assert.equal(sha(path.join(root,item.path)),item.sha256,item.path);
 assert.equal(sha(path.join(root,seal.currentReport.path)),seal.currentReport.sha256);
 const priorName='prior-staging-acceptance-phase91.md';
 fs.copyFileSync(path.join(root,seal.currentReport.path),path.join(out,priorName),fs.constants.COPYFILE_EXCL);
 const manifest={id,out,at:new Date().toISOString(),timezone:'Asia/Baghdad',stage:'PROPOSAL_ONLY_AWAITING_OWNER_HOST_AND_PRICE_APPROVAL',
  dedicatedHostProvided:false,spareHostAvailability:'OWNER_ANSWER_PENDING_NOT_ASSUMED_ABSENT',
  providerApproved:false,provisioningAuthorized:false,executionEnabled:false,
  productionConnected:false,resourcesPurchased:0,resourcesProvisioned:0,paidInference:0,
  previousSeal:{path:'docs/benchmarks/phase91-envelope/786dbfa4/evidence-seal.json',sha256:sha(path.join(previous,'evidence-seal.json'))},
  priorReport:{canonical:seal.currentReport.path,archived:'docs/benchmarks/phase92-infrastructure/'+id+'/'+priorName,sha256:seal.currentReport.sha256}};
 save('manifest.json',manifest);
 // Public catalog endpoints only. Never send account credentials or API keys.
 let linode;
 try{
  const r=await fetch('https://api.linode.com/v4/linode/types/g6-standard-4',{signal:AbortSignal.timeout(15000)});
  assert.equal(r.status,200);const x=await r.json();assert.equal(x.id,'g6-standard-4');
  linode={provider:'Akamai / Linode',source:'https://api.linode.com/v4/linode/types/g6-standard-4',at:new Date().toISOString(),
   method:'UNAUTHENTICATED_PUBLIC_CATALOG_GET',plan:x.id,label:x.label,currency:'USD',price:x.price,
   memoryMiB:x.memory,diskMiB:x.disk,vcpus:x.vcpus,transfer:x.transfer,class:x.class,
   backupPrice:x.addons?.backups?.price,regionPriceOverrides:x.region_prices||[],backupRegionPriceOverrides:x.addons?.backups?.region_prices||[],
   checkoutVerified:false,ownerApproved:false,stockVerified:false};
 }catch(e){linode={provider:'Akamai / Linode',source:'https://api.linode.com/v4/linode/types/g6-standard-4',at:new Date().toISOString(),verified:false,errorCode:e.code||'PUBLIC_CATALOG_UNAVAILABLE',ownerApproved:false};}
 save('linode-public-catalog.json',linode);
 const digitalOcean={provider:'DigitalOcean',plan:'Basic / Regular / 8GiB / 4vCPU / 160GiB SSD',currency:'USD',
  baseMonthly:48,baseHourly:0.07143,memoryMiB:8192,vcpus:4,diskGiB:160,
  source:'https://www.digitalocean.com/pricing/droplets',backupSource:'https://docs.digitalocean.com/products/backups/details/pricing/',
  verification:'Official public pricing page read during this proposal; NOT an account checkout or stock confirmation',at:new Date().toISOString(),
  ipv4:'Included for bundled Basic plans per pricing FAQ',weeklyBackupPercent:20,monthlyIncludingWeeklyBackup:57.6,
  excluded:['tax','off-machine application-aware backup destination','excess transfer','optional identity/monitoring service','extra volumes/snapshots'],
  ownerApproved:false,regionSelected:false,checkoutVerified:false,stockVerified:false};
 save('digitalocean-public-quote.json',digitalOcean);
 save('shortlist.json',{at:new Date().toISOString(),kind:'PUBLIC_LIST_QUOTES_NOT_PURCHASE_APPROVAL',options:[digitalOcean,linode,
  {provider:'Hetzner',plan:'CPX32',vcpus:4,memoryVendorLabel:'8 GB',diskVendorLabel:'160 GB NVMe',source:'https://www.hetzner.com/cloud/regular-performance/',
   verifiedComputePrice:null,verifiedAllInPrice:null,reason:'Public live page exposes specs but not usable numeric compute prices; earlier price-adjustment URL returned404. Do not use search snippets or third-party prices as a current quote. Region/stock/checkout require owner verification.',
   primaryIpv4EuroMonthly:0.5,ipSource:'https://docs.hetzner.com/cloud/servers/primary-ips/overview/',ownerApproved:false}],
  totalsAreNotCompleteOperatingCost:true,conversionToIqdPerformed:false,selectedProvider:null,monthlyBudgetApproved:null});
 const envelope=read(path.join(previous,'provisional-resource-envelope.json'));
 save('infrastructure-proposal.json',{kind:'DEDICATED_STAGING_DESIGN_NOT_DEPLOYED',
  host:{minimumVcpus:4,minimumRamBytes:8*2**30,minimumSsdBytes:100000000000,architecture:'linux/amd64',osCandidate:'Ubuntu24.04LTS',
   certified:false,provider:null,plan:null,region:null,publicIp:null,sshAccount:null,sshHostKey:null,hostname:null,dedicatedPurposeNotBareMetal:true},
  reuseMeasuredEnvelope:envelope.services,aggregateReservedMiB:3200,aggregateCpuCores:3,availableForOsAndUnbudgetedOn8GiBMiB:8192-3200,
  ioHardLimits:null,ioAcceptance:'Measure on approved dedicated scratch/data volumes; never extrapolate quiet production samples',
  diskPlanningGiB:{osAndImages:32,data:32,restrictedBackups:8,scratch:8,logs:2,totalAllocated:82},
  diskQualification:'82GiB fits within nominal100GB before filesystem overhead/headroom; layout is provisional. Never partition/format an existing spare host without separate reviewed disk authority.',
  proposedProject:'rezona-stage-p92-'+id,projectCreated:false,
  networks:{backend:'internal only; API/postgres/redis/S3, no host data ports',edge:'gateway only, fixed approved upstream; no arbitrary forwarding'},
  publicPorts:{ssh:'owner-approved operator CIDRs only',https:'owner-approved private/VPN or MFA-equivalent ingress only',http:'closed unless separately approved ACME/redirect need'},
  dataPortsPublished:false,outboundProviders:'blocked by configuration AND network; no fal/payment/push production credentials',
  strongAccess:{selected:false,proposal:'Owner-approved device-authenticated private access with MFA identity or mobile-compatible equivalent, plus existing Admin JWT/RBAC. No browser-only challenge assumed compatible.',
   extraRuntimeCostAndResourcesApproved:false},
  restoreLanes:['offline protected historical19 clone; no API/worker access','separate migrated clone after formal history disposition; seal before business tests','separate synthetic acceptance application DB; never copied customer wallets for test transactions'],
  historicalCloneDbIsolation:'Separate service/network or offline volume, not another database accessible to a postgres-superuser API',
  specialConstraints:['Existing entrypoint uses PostgreSQL hostname postgres and database live_commerce; isolate server/volume/credentials rather than assuming arbitrary DB_NAME override',
   'Customer API/socket endpoints are compile-time dart-defines; unchanged released APK cannot be retargeted by server env alone. Approved test-only routing/TLS method remains required; no global production DNS override or production TLS-key reuse.',
   'In-process auction/push workers exist; do not boot against an unreviewed historical clone assuming there is a global worker-disable flag.',
   'Phase91 pure stop policy exact-project allowlist must be reviewed/adapted/tested for the new dedicated project before activation; no automatic global prefix replacement.'],
  requiredOwnerInputs:['Spare-host details OR approved provider/plan/region/price/taxes/backups and total spend cap','Explicit host provisioning and access scope','Verified dedicated IP/SSH profile/host-key fingerprint via secure local channel','Approved staging hostname/DNS/ingress/TLS and mobile-compatible strong access','Alert recipient and off-machine backup destination/cost approval','Formal non-destructive migration-history disposition','Released Customer artifact/test-routing approval and separate physical-device authority'],
  gates:{infrastructureProposalPrepared:true,hostProvided:false,purchaseApproved:false,stagingProvisioned:false,httpsAccepted:false,historyDisposition:false,migration19To40:false,storageFullAcceptance:false,adminCustomerAcceptance:false,deviceAcceptance:false,alertsDelivered:false,fullRecoveryAccepted:false},
  stagingVerdict:'FAIL_NOT_PROVISIONED',productionVerdict:'NO_GO',finalProductionGoRequested:false});
 console.log(JSON.stringify({id,out,previousEvidenceVerified:true,priorReportArchived:manifest.priorReport.archived,linodeCatalogVerified:!!linode.price,hostProvided:false,provisioned:false}));
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
