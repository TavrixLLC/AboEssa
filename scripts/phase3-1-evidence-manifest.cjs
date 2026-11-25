const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const {createHash}=require('node:crypto');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'docs/benchmarks/phase3-1');
async function entry(file) {
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file)) hash.update(chunk);
  return {path:file,bytes:(await fs.stat(file)).size,sha256:hash.digest('hex')};
}
(async()=>{
  const artifacts=[];
  for(const name of await fs.readdir(dir)) {
    if(name==='evidence-manifest.json')continue;
    const file=path.join(dir,name);
    if((await fs.stat(file)).isFile()) artifacts.push(await entry(file));
  }
  const apks=[];
  for(const name of ['before','after','final','retained','coverage'])
    apks.push(await entry(`D:/rezona-phase3-validation-20261117/phase3-1-${name}-release.apk`));
  const dependencyFiles=[];
  for(const file of [path.join(root,'package.json'),path.join(root,'package-lock.json'),
    path.resolve(root,'../AboEssaMobile/pubspec.lock')]) dependencyFiles.push(await entry(file));
  await fs.writeFile(path.join(dir,'evidence-manifest.json'),JSON.stringify({
    generatedAt:new Date().toISOString(),package:'com.tavrix.aboessa_customer_app.phase3qa',
    decision:'NO_GO',productionDeployed:false,phase4Started:false,
    note:'QA APKs only; no keys/defines included; artifact hashes exclude this self-referential manifest',
    artifacts,apks,dependencyFiles,
  },null,2));
  console.log({artifacts:artifacts.length,totalMiB:artifacts.reduce((s,a)=>s+a.bytes,0)/1048576,apks:apks.length});
})().catch(e=>{console.error(e);process.exitCode=1});
