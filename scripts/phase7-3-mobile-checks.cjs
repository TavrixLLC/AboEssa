const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),m=JSON.parse(fs.readFileSync('D:/rezona-phase7-3-qa/pilot-manifest.json','utf8'));
const app=path.resolve(root,'../AboEssaMobile/apps/admin_app'),flutter='C:/Users/3ma/develop/flutter/bin/flutter.bat',stamp=Date.now();
const jobs=[['admin-tests',['test','--no-pub','--reporter','expanded']],
 ['admin-analysis',['analyze','--no-pub','lib/features/product_intake/intake_enhancement_card.dart','lib/features/product_intake/intake_repository.dart','test/intake_tabletop_styles_card_test.dart','test/intake_enhancement_test.dart']]];
for(const[name,args]of jobs){
 const env={...process.env};delete env.REZONA_TABLETOP_RENDER_DIR;
 const r=spawnSync('cmd.exe',['/d','/c',flutter,...args],{cwd:app,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:32*1024*1024});
 const log=(r.stdout??'')+'\n'+(r.stderr??'');fs.writeFileSync(path.join(m.out,name+'-'+stamp+'.log'),log,{flag:'wx'});
 console.log(JSON.stringify({name,passed:r.status===0,summary:log.trim().split(/\r?\n/).slice(-5)}));if(r.status!==0)process.exit(1);
}
