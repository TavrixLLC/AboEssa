if(process.env.REZONA_PHASE71_QA!=='1')throw Error('Explicit local Phase7.1 QA required');
const {spawnSync}=require('node:child_process');
const run=(args)=>{const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout.trim();};
for(const [name,args] of [
 ['postgres',['--memory=1g','--cpus=2','-p','127.0.0.1:55452:5432','-e','POSTGRES_USER=phase71_qa','-e','POSTGRES_PASSWORD=phase71-local-only','-e','POSTGRES_DB=rezona_phase71_qa','-v','rezona-phase71-pg:/var/lib/postgresql/data','postgres:16-alpine']],
 ['redis',['--memory=256m','--cpus=1','-p','127.0.0.1:56392:6379','redis:7-alpine','redis-server','--maxmemory','128mb','--maxmemory-policy','noeviction']],
 ['minio',['--memory=512m','--cpus=1','-p','127.0.0.1:59052:9000','-e','MINIO_ROOT_USER=phase71-qa','-e','MINIO_ROOT_PASSWORD=phase71-local-only','-v','rezona-phase71-media:/data','minio/minio:RELEASE.2025-09-07T16-13-09Z','server','/data']],
]){const target='rezona-phase71-qa-'+name;const r=spawnSync('docker',['inspect','--format','{{index .Config.Labels "rezona.qa"}}',target],{encoding:'utf8',windowsHide:true});
 if(r.status===0){if(r.stdout.trim()!=='phase71')throw Error('Refusing unrelated container');console.log(run(['start',target]));}
 else console.log(run(['run','-d','--name',target,'--label','rezona.qa=phase71',...args]));
}
