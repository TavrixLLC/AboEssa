// Fixed, bounded READ-ONLY host preflight. No remote files or service mutations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {Client}=require('D:/rezona-admin-hardening/run-130f0653/ssh-tool/node_modules/ssh2');
const root=path.resolve(__dirname,'..'),id=randomUUID().slice(0,8),out=path.join(root,'docs/benchmarks/phase91-host',id);
fs.mkdirSync(out,{recursive:true});
const pub=fs.readFileSync('D:/rezona-admin-hardening/run-130f0653/trusted-server-ed25519.pub','utf8').trim().split(/\s+/);
assert.equal(pub[1],'ssh-ed25519');const trusted=Buffer.from(pub[2],'base64');
const q=s=>"'"+s.replaceAll("'","'\\''")+"'";
const sql=`SELECT json_build_object('migrations',(SELECT json_agg(s) FROM (SELECT migration_name,checksum,finished_at IS NOT NULL AS complete,rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY migration_name) s),'databaseBytes',pg_database_size(current_database()),'products',(SELECT count(*) FROM "ProductListing"),'orders',(SELECT count(*) FROM "Order"),'customers',(SELECT count(*) FROM "Customer"),'auctions',(SELECT count(*) FROM "Auction"),'fileAssets',(SELECT count(*) FROM "FileAsset"),'walletEntries',(SELECT count(*) FROM "WalletEntry"),'waitingLocks',(SELECT count(*) FROM pg_locks WHERE NOT granted),'longestTransactionSeconds',(SELECT coalesce(max(extract(epoch from clock_timestamp()-xact_start)),0) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()));`;
const commands={
 definitions:[
  'date -u +%FT%TZ','uptime','free -b','getconf _NPROCESSORS_ONLN',
  'docker compose version',
  "docker info --format 'Root={{.DockerRootDir}} Driver={{.Driver}} Cgroup={{.CgroupVersion}} Security={{json .SecurityOptions}}'",
  'findmnt -T /opt/aboessa -no SOURCE,FSTYPE,OPTIONS,TARGET','findmnt -T /var/lib/docker -no SOURCE,FSTYPE,OPTIONS,TARGET',
  'lsblk -d -o NAME,MAJ:MIN,SIZE,ROTA,TYPE','cat /sys/block/sda/queue/scheduler',
  "printf '\\nCGROUP_CONTROLLERS\\n'; cat /sys/fs/cgroup/cgroup.controllers; printf '\\nROOT_MEMORY_EVENTS\\n'; if test -r /sys/fs/cgroup/memory.events; then cat /sys/fs/cgroup/memory.events; else printf 'ROOT_CONTROLLER_EVENTS_UNAVAILABLE\\n'; fi",
  "docker ps --format '{{.Names}} {{.Status}}'",
  'docker inspect --format '+q('{{.Name}} image={{.Image}} start={{.State.StartedAt}} restarts={{.RestartCount}} memory={{.HostConfig.Memory}} swap={{.HostConfig.MemorySwap}} nanoCPUs={{.HostConfig.NanoCpus}} cgroupParent={{.HostConfig.CgroupParent}} blkioWeight={{.HostConfig.BlkioWeight}} readBps={{json .HostConfig.BlkioDeviceReadBps}} writeBps={{json .HostConfig.BlkioDeviceWriteBps}} logs={{json .HostConfig.LogConfig}} networks={{range $k,$v:=.NetworkSettings.Networks}}{{$k}} {{end}} mounts={{range .Mounts}}{{.Type}}:{{index . "Name"}}:{{.Destination}} {{end}}')+' aboessa-api-1 aboessa-postgres-1 aboessa-redis-1 aboessa-minio-1 aboessa-nginx-1',
  "printf '\\nRELEASE\\n'; readlink -f /opt/aboessa/current",
  "printf '\\nDISK\\n'; df -B1 /opt/aboessa /var/lib/docker; df -i /opt/aboessa",
  "printf '\\nQUOTA_TOOLS\\n'; for c in quota repquota xfs_quota losetup systemd-run; do command -v \"$c\" || true; done",
  "printf '\\nDOCKER_DAEMON_RESOURCE_PARENT\\n'; systemctl show docker --property=MemoryMax,CPUQuotaPerSecUSec,ControlGroup",
 ].join('; '),
 database:'docker exec -e '+q('PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000')+' aboessa-postgres-1 psql -X -U postgres -d live_commerce -Atc '+q(sql),
 observation:"date -u +%FT%TZ; vmstat -w 2 16; docker stats --no-stream --format '{{json .}}' aboessa-api-1 aboessa-postgres-1 aboessa-redis-1 aboessa-minio-1 aboessa-nginx-1; for r in cpu memory io; do printf '%s ' \"$r\"; cat /proc/pressure/$r; done; curl --silent --show-error --max-time 10 --output /dev/null --write-out 'READY %{http_code} TLS %{ssl_verify_result} TIME %{time_total}\\n' https://shanasheel.tavrixllc.com/ready; date -u +%FT%TZ",
 continuity:"date -u +%FT%TZ; free -b; docker inspect --format "+q('{{.Name}} {{.Image}} {{.State.StartedAt}} {{.RestartCount}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}')+" aboessa-api-1 aboessa-postgres-1 aboessa-redis-1 aboessa-minio-1 aboessa-nginx-1; curl --silent --show-error --max-time 10 --output /dev/null --write-out 'READY %{http_code} TLS %{ssl_verify_result} TIME %{time_total}\\n' https://shanasheel.tavrixllc.com/ready; df -B1 /opt/aboessa",
};
let password='';process.stdin.setEncoding('utf8');process.stdin.on('data',b=>{password+=b;if(password.length>1024)process.exit(2)});
process.stdin.on('end',()=>{
 const c=new Client();let verified=false;
 const save=(name,x)=>fs.writeFileSync(path.join(out,name),JSON.stringify(x,null,2),{flag:'wx'});
 save('manifest.json',{id,out,at:new Date().toISOString(),scope:'READ_ONLY_PREFLIGHT_NO_PROVISIONING',target:'217.76.54.57',hostKeySha256:createHash('sha256').update(trusted).digest('base64')});
 c.on('ready',async()=>{password='';try{for(const [label,command]of Object.entries(commands).filter(([label])=>!['definitions-only','continuity-only'].includes(process.argv[2])||label===process.argv[2].replace('-only','')))await new Promise((resolve,reject)=>{
  let output='',stderr='',finished=false;const at=Date.now();
  const timer=setTimeout(()=>{c.destroy();reject(Error('BOUNDED_READ_TIMEOUT'))},50000);
  c.exec(command,(e,s)=>{if(e){clearTimeout(timer);return reject(Error('SSH_EXEC_FAILED'))}s.on('data',b=>{output+=b;if(output.length>262144){s.close();clearTimeout(timer);reject(Error('OUTPUT_BOUND'))}});s.stderr.on('data',b=>{stderr+=b;if(stderr.length>4096){s.close();clearTimeout(timer);reject(Error('STDERR_BOUND'))}});s.on('close',code=>{if(finished)return;finished=true;clearTimeout(timer);save(label+'.json',{label,at:new Date().toISOString(),durationMs:Date.now()-at,hostKeyVerified:verified,exitCode:code,output,stderr,deliberateProductionMutations:0});console.log(JSON.stringify({id,label,exitCode:code}));resolve()})});
 });save('complete.json',{at:new Date().toISOString(),hostKeyVerified:verified,productionMutations:0,provisioning:false});}catch(e){save('failure.json',{at:new Date().toISOString(),code:e.code||e.message,productionMutations:0});process.exitCode=1;}finally{c.end()}});
 c.on('error',e=>{password='';save('connection-failure-'+Date.now()+'.json',{code:e.code||e.level||'SSH_FAILED',hostKeyVerified:verified});console.log(JSON.stringify({id,failed:true,code:e.code||e.level||'SSH_FAILED'}));process.exitCode=1});
 c.connect({host:'217.76.54.57',port:22,username:'root',password:password.trim(),readyTimeout:30000,hostVerifier:k=>(verified=k.equals(trusted))});
});
