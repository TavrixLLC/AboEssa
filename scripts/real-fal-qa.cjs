// Fresh no-overwrite evidence workspace; never dispatches inference.
const fs = require('node:fs'), path = require('node:path'), {randomUUID,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'), base='D:/rezona-real-fal-qa', pointer=path.join(base,'current.json');
const sha=b=>createHash('sha256').update(b).digest('hex');
if(process.argv[2]==='init'){
 fs.mkdirSync(base,{recursive:true}); const id=randomUUID().slice(0,8),dir=path.join(base,'run-'+id),out=path.join(root,'docs/benchmarks/real-fal-studio',id);
 fs.mkdirSync(dir);fs.mkdirSync(out,{recursive:true});
 const prior=JSON.parse(fs.readFileSync('D:/rezona-real-studio-qa/manifest.json','utf8'));
 const seal=JSON.parse(fs.readFileSync(path.join(prior.out,'final-validation.json'),'utf8'));
 const protectedFiles=[...seal.evidence,...seal.privateArtifacts,...seal.screenshots,...seal.comparisonBoards,{file:path.join(prior.out,'final-validation.json'),sha256:sha(fs.readFileSync(path.join(prior.out,'final-validation.json')))}];
 const m={id,dir,out,priorManifest:'D:/rezona-real-studio-qa/manifest.json',createdAt:new Date().toISOString(),protectedFiles,initialSources:seal.sources};
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(m,null,2),{flag:'wx'});
 fs.writeFileSync(pointer,JSON.stringify({manifest:path.join(dir,'manifest.json')},null,2),{flag:'wx'});
 console.log(JSON.stringify({id,dir,out}));
} else {
 const m=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(pointer,'utf8')).manifest,'utf8'));
 for(const r of m.protectedFiles)if(sha(fs.readFileSync(r.file))!==r.sha256)throw Error('PROTECTED_EVIDENCE_CHANGED');
 const p=JSON.parse(fs.readFileSync(m.priorManifest,'utf8'));for(const r of p.photos)for(const f of[r.path,r.original].filter(Boolean)){if(sha(fs.readFileSync(f))!==r.sha256)throw Error('ORIGINAL_CHANGED');}
 console.log(JSON.stringify({preservedEvidence:m.protectedFiles.length,originals:p.photos.length,unchanged:true}));
}
