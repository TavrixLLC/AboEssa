// Fixed passive inspection only. Never starts/stops/reconfigures services,
// writes remote files, sends inference, runs migrations, or reads customer rows.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { Client } = require('D:/rezona-admin-hardening/run-130f0653/ssh-tool/node_modules/ssh2');
const root = path.resolve(__dirname, '..');
const trustedText = fs.readFileSync('D:/rezona-admin-hardening/run-130f0653/trusted-server-ed25519.pub', 'utf8').trim().split(/\s+/);
assert.equal(trustedText[1], 'ssh-ed25519');
const trusted = Buffer.from(trustedText[2], 'base64');
const q = s => "'" + s.replaceAll("'", "'\\''") + "'";
const id = randomUUID().slice(0, 8);
const out = path.join(root, 'docs/benchmarks/phase9-capacity', id);
const privateDir = path.join('D:/rezona-phase9-capacity', 'run-' + id);
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(privateDir, { recursive: true });
const save = (name, x) => fs.writeFileSync(path.join(out, name), JSON.stringify(x, null, 2), { flag: 'wx' });
const at = () => new Date().toISOString();
const section = (name, command) => `printf '\\nSECTION ${name}\\n'; ${command}`;
const names = ['aboessa-nginx-1', 'aboessa-api-1', 'aboessa-postgres-1', 'aboessa-redis-1', 'aboessa-minio-1'];
const mode = process.argv[2] || 'full';
assert.ok(['full', 'redis-only'].includes(mode));
const inspect = '{{json .Name}} {{json .Image}} {{json .State.Status}} {{json .State.StartedAt}} {{json .RestartCount}} {{json .HostConfig.Memory}} {{json .HostConfig.MemorySwap}} {{json .HostConfig.NanoCpus}} {{json .HostConfig.CpuQuota}} {{json .HostConfig.CpuPeriod}} {{json .HostConfig.PidsLimit}} {{json .HostConfig.LogConfig}} {{json .HostConfig.PortBindings}}';
const baseline = [
  'set -u',
  section('clock', 'date -u +%FT%TZ; uptime; uname -srm'),
  section('os', "grep -E '^(NAME|VERSION|VERSION_ID)=' /etc/os-release"),
  section('cpu', "getconf _NPROCESSORS_ONLN; lscpu | grep -E '^CPU\\(s\\)|^On-line CPU|^Model name|^Thread|^Core|^Socket|^Hypervisor'"),
  section('memory', "free -b; grep -E '^(MemTotal|MemFree|MemAvailable|Buffers|Cached|SwapTotal|SwapFree|Dirty|Writeback|Slab|SReclaimable|PageTables):' /proc/meminfo"),
  section('pressure', "for r in cpu memory io; do printf '%s ' \"$r\"; if test -r /proc/pressure/$r; then cat /proc/pressure/$r; else printf 'UNAVAILABLE\\n'; fi; done"),
  section('disk', 'df -B1 / /opt/aboessa /var/lib/docker; df -i / /var/lib/docker; lsblk -d -o NAME,SIZE,ROTA,TYPE'),
  section('docker_footprint', "docker system df; docker info --format 'CPUs={{.NCPU}} MemoryBytes={{.MemTotal}} Storage={{.Driver}} Cgroup={{.CgroupVersion}} Containers={{.Containers}} Images={{.Images}}'"),
  section('containers', "docker ps --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}'"),
  section('limits', 'docker inspect --format ' + q(inspect) + ' ' + names.join(' ')),
  section('mounts', 'docker inspect --format ' + q('{{.Name}} {{range .Mounts}}{{.Type}}:{{.Name}}:{{.Destination}} {{end}}') + ' ' + names.join(' ')),
  section('release', "readlink -f /opt/aboessa/current; docker inspect --format '{{.Image}}' aboessa-api-1"),
  section('backups', "find /opt/aboessa/backups -maxdepth 2 -type f -printf '%s %TY-%Tm-%TdT%TH:%TM %f\\n' | head -60; du -sk /opt/aboessa/backups"),
  section('listening', 'ss -lnt'),
  section('oom_events', "dmesg --since '24 hours ago' 2>/dev/null | grep -Ei 'out of memory|oom-kill|killed process' | sed -E 's/.*(Out of memory|oom-kill|Killed process).*/OOM_EVENT_RECORDED/i' | head -10 || true"),
].join('; ');
const cgroups = names.map(name => `printf '\\nCONTAINER ${name}\\n'; pid=$(docker inspect --format '{{.State.Pid}}' ${name}); case "$pid" in ''|*[!0-9]*) printf 'PID_UNAVAILABLE\\n';; *) cg=$(awk -F: '$1=="0"{print $3}' /proc/$pid/cgroup); if test -n "$cg" && test -d "/sys/fs/cgroup$cg"; then for f in memory.current memory.peak memory.max memory.events cpu.max cpu.stat io.stat pids.current; do if test -r "/sys/fs/cgroup$cg/$f"; then printf '%s\\n' "$f"; cat "/sys/fs/cgroup$cg/$f"; fi; done; else printf 'CGROUP_V2_UNAVAILABLE\\n'; fi;; esac`).join('; ');
const sample = [
  'set -u', section('clock', 'date -u +%FT%TZ'),
  section('vmstat', 'vmstat -w 2 6'),
  section('docker_stats', "docker stats --no-stream --format '{{json .}}' " + names.join(' ')),
  section('cgroups', cgroups),
  section('memory', 'free -b'),
  section('pressure', 'for r in cpu memory io; do printf "%s " "$r"; cat /proc/pressure/$r; done'),
  section('diskstats', 'cat /proc/diskstats'),
  section('iostat', 'if command -v iostat >/dev/null 2>&1; then iostat -xz 2 3; else printf "NOT_INSTALLED_NO_INSTALL_ATTEMPTED\\n"; fi'),
  section('ready', "curl --silent --show-error --max-time 10 --output /dev/null --write-out 'STATUS %{http_code} TLS_VERIFY %{ssl_verify_result} TIME %{time_total}\\n' https://shanasheel.tavrixllc.com/ready"),
].join('; ');
const sql = `SELECT json_build_object('serverVersion',current_setting('server_version'),'maxConnections',current_setting('max_connections'),'sharedBuffers',current_setting('shared_buffers'),'workMem',current_setting('work_mem'),'maintenanceWorkMem',current_setting('maintenance_work_mem'),'databaseBytes',pg_database_size(current_database()),'connections',(SELECT count(*) FROM pg_stat_activity),'activity',(SELECT json_agg(s) FROM (SELECT state,wait_event_type,count(*) FROM pg_stat_activity WHERE datname=current_database() GROUP BY state,wait_event_type) s),'longestTransactionSeconds',(SELECT coalesce(max(extract(epoch from clock_timestamp()-xact_start)),0) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()),'locksWaiting',(SELECT count(*) FROM pg_locks WHERE NOT granted),'tableEstimates',(SELECT json_agg(s) FROM (SELECT relname,n_live_tup,n_dead_tup,pg_total_relation_size(relid) AS total_bytes FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15) s),'dbStats',(SELECT row_to_json(s) FROM (SELECT numbackends,xact_commit,xact_rollback,blks_read,blks_hit,temp_files,temp_bytes,deadlocks,stats_reset FROM pg_stat_database WHERE datname=current_database()) s));`;
const postgres = 'docker exec -e ' + q('PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000') + ' aboessa-postgres-1 psql -X -U postgres -d live_commerce -Atc ' + q(sql);
// Redis INFO + LLEN/ZCARD/HGET only, never Queue() (constructor may write meta).
// The already-configured backend URL is used in-process; it is never printed.
const redisJs = `(async()=>{const Redis=require('ioredis'),fs=require('node:fs'),u=process.env.REDIS_URL;let target=u;if(!target){if(!fs.existsSync('/run/secrets/redis_password')){console.log(JSON.stringify({available:false,code:'REDIS_CONFIG_UNAVAILABLE'}));return;}target={host:'redis',port:6379,password:fs.readFileSync('/run/secrets/redis_password','utf8').replace(/\\n+$/,'')};}const settings={lazyConnect:true,maxRetriesPerRequest:0,enableOfflineQueue:false,connectTimeout:4000,retryStrategy:()=>null};const r=typeof target==='string'?new Redis(target,settings):new Redis({...target,...settings});r.on('error',()=>{});try{await r.connect();const allowed=new Set(['redis_version','uptime_in_seconds','connected_clients','blocked_clients','used_memory','used_memory_rss','used_memory_peak','maxmemory','maxmemory_policy','total_system_memory','mem_fragmentation_ratio','instantaneous_ops_per_sec','total_commands_processed','keyspace_hits','keyspace_misses','rejected_connections','evicted_keys','rdb_last_bgsave_status','rdb_last_save_time','rdb_changes_since_last_save','aof_enabled','aof_last_write_status','aof_current_size','aof_last_bgrewrite_status','latest_fork_usec']);const info={};for(const line of (await r.info()).split(/\\r?\\n/)){const i=line.indexOf(':');if(i>0&&allowed.has(line.slice(0,i)))info[line.slice(0,i)]=line.slice(i+1);}const queues=[];for(const name of ['auction-close','push-delivery','catalog-image-variants','product-recognition-v1','product-image-enhancement-v1']){const prefix='bull:'+name+':';const counts={};for(const key of ['wait','active','paused'])counts[key]=await r.llen(prefix+key);for(const key of ['delayed','failed','completed','waiting-children','prioritized'])counts[key]=await r.zcard(prefix+key);const paused=await r.hget(prefix+'meta','paused');queues.push({name,counts,paused:paused==='1'});}console.log(JSON.stringify({available:true,info,queues,readsOnly:true,jobPayloadsRead:false,credentialValueRecorded:false}));}catch(e){console.log(JSON.stringify({available:false,code:['WRONGTYPE','NOAUTH','WRONGPASS'].find(c=>String(e.message).startsWith(c))||e.code||'REDIS_READ_FAILED'}));}finally{r.disconnect();}})();`;
const redis = 'docker exec aboessa-api-1 node -e ' + q(redisJs);
const manifest = { id, out, privateDir, at: at(), timezone: 'Asia/Baghdad',
  target: '217.76.54.57', scope: 'PASSIVE_READ_ONLY_CAPACITY_PREFLIGHT', mode,
  productionWritesAuthorized: false, deploymentAuthorized: false, stagingProvisioningPerformed: false,
  hostKeySha256: createHash('sha256').update(trusted).digest('base64'),
  forbidden: ['remote-files','deploy','migrations','restart','credentials-change','paid-inference','customer-row-reads','stress-test'],
  previousReview: 'phase9-release-review/0f3e402b' };
save('manifest.json', manifest);
fs.writeFileSync(path.join(privateDir, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
let secret = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', b => { secret += b; if (secret.length > 1024) process.exit(2); });
process.stdin.on('end', () => {
  const client = new Client(); let hostKeyVerified = false;
  const results = [];
  function execute(label, command) {
    return new Promise(resolve => {
      const start = Date.now(); let stdout = '', stderr = '', finished = false;
      const finish = (exitCode, code = null) => {
        if (finished) return; finished = true; clearTimeout(timer);
        const result = { label, at: at(), durationMs: Date.now() - start, exitCode, errorCode: code,
          hostKeyVerified, passed: exitCode === 0, output: stdout, stderr, productionMutations: 0 };
        save(label + '.json', result); results.push({ label, passed: result.passed, durationMs: result.durationMs });
        console.log(JSON.stringify({ id, label, passed: result.passed, durationMs: result.durationMs })); resolve(result);
      };
      const timer = setTimeout(() => { client.destroy(); finish(null, 'BOUNDED_READ_TIMEOUT'); }, 55000);
      client.exec(command, (err, stream) => {
        if (err) return finish(null, 'SSH_EXEC_FAILED');
        stream.on('data', b => { stdout += b.toString(); if (stdout.length > 512 * 1024) { stream.close(); finish(null, 'OUTPUT_LIMIT'); } });
        stream.stderr.on('data', b => { stderr += b.toString(); if (stderr.length > 4096) { stream.close(); finish(null, 'STDERR_LIMIT'); } });
        stream.on('close', code => finish(code));
      });
    });
  }
  client.on('ready', async () => {
    secret = '';
    try {
      if (mode === 'full') {
        await execute('baseline', baseline);
        await execute('postgres-before', postgres);
        await execute('redis-before', redis);
        for (let i = 1; i <= 3; i++) await execute('sample-' + i, sample);
        await execute('postgres-after', postgres);
        await execute('redis-after', redis);
      } else {
        await execute('redis-followup', redis);
        await execute('service-continuity', 'docker inspect --format ' + q(inspect) + ' ' + names.join(' '));
      }
      save('collection-summary.json', { at: at(), hostKeyVerified, results,
        productionMutations: 0, deployment: false, stressTest: false, paidCalls: 0,
        qualification: 'Short passive observation, not a production peak history or staged-load acceptance' });
    } catch (e) {
      save('collection-failure.json', { at: at(), code: e.code || 'LOCAL_COLLECTION_FAILED', productionMutations: 0 });
      process.exitCode = 1;
    } finally { client.end(); }
  });
  client.on('error', e => {
    secret = '';
    save('ssh-failure-' + Date.now() + '.json', { at: at(), code: e.code || e.level || 'SSH_FAILED', hostKeyVerified, productionMutations: 0 });
    console.log(JSON.stringify({ id, failed: true, code: e.code || e.level || 'SSH_FAILED' })); process.exitCode = 1;
  });
  client.connect({ host: '217.76.54.57', port: 22, username: 'root', password: secret.trim(),
    readyTimeout: 30000, hostVerifier: key => (hostKeyVerified = key.equals(trusted)) });
});
