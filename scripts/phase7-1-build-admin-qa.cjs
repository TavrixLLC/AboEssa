// Build-only. Does NOT call ADB, install, start or clear an application.
if(process.env.REZONA_PHASE71_QA!=='1') throw Error('Explicit Phase7 QA required');
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),mobile=path.resolve(root,'../AboEssaMobile/apps/admin_app'),out='D:/rezona-phase7-1-qa/build',apk=path.join(mobile,'build/app/outputs/flutter-apk/app-debug.apk');
fs.mkdirSync(out,{recursive:true});const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(fs.existsSync(apk)){const archive=path.join(out,'previous-'+sha(apk)+'.apk');if(!fs.existsSync(archive))fs.copyFileSync(apk,archive);if(sha(archive)!==sha(apk))throw Error('Previous build archive mismatch');}
const defs={API_BASE_URL:'http://127.0.0.1:18493',SOCKET_URL:'http://127.0.0.1:18493',APP_ENV:'local',INVENTORY_MANAGEMENT_ENABLED:'true',RAPID_PRODUCT_INTAKE_ENABLED:'true',IMAGE_ENHANCEMENT_ENABLED:'true'};
const encoded=Object.entries(defs).map(([k,v])=>Buffer.from(`${k}=${v}`).toString('base64')).join(',');
const args=['/d','/c',path.join(mobile,'android/gradlew.bat'),'--offline','--init-script',path.join(root,'scripts/phase7-qa.init.gradle'),'-Ptarget-platform=android-arm64','-Ptarget=lib/main.dart','-Pbase-application-name=android.app.Application',`-Pdart-defines=${encoded}`,'-Pdart-obfuscation=false','-Ptrack-widget-creation=true','-Ptree-shake-icons=false','assembleDebug'];
const log=fs.createWriteStream(path.join(out,'build.log'));
const child=spawn('cmd.exe',args,{cwd:path.join(mobile,'android'),env:{...process.env,REZONA_PHASE5_QA:'0',REZONA_PHASE6_QA:'0',REZONA_PHASE7_QA:'1',JAVA_HOME:'C:/Program Files/Android/Android Studio/jbr'},windowsHide:true});
child.stdout.on('data',d=>log.write(d));child.stderr.on('data',d=>log.write(d));
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
child.on('exit',code=>{log.end();if(code!==0){console.error('Build failed. See isolated build.log');process.exitCode=code??1;return;}
 const {spawnSync}=require('node:child_process');const info=spawnSync('C:/Users/3ma/AppData/Local/Android/sdk/build-tools/36.0.0/aapt.exe',['dump','badging',apk],{encoding:'utf8',windowsHide:true});
 if(info.status!==0||!info.stdout.includes("package: name='com.singlestore.admin_app.phase7qa'"))throw Error('Unexpected APK package');
 const result={time:new Date().toISOString(),built:true,installed:false,physicalAcceptance:'INSTALL_REQUESTED_BY_USER_NOT_YET_VERIFIED',target:'lib/main.dart',package:'com.singlestore.admin_app.phase7qa',sha256:sha(apk),bytes:fs.statSync(apk).size,defines:defs,scope:'Separate arm64 debug QA package only, not signed release; no install attempted'};
 const final=path.join(out,'rezona-phase71-admin-qa-'+result.sha256.slice(0,12)+'.apk');if(!fs.existsSync(final))fs.copyFileSync(apk,final);result.archive=final;fs.mkdirSync(path.join(root,'docs/benchmarks/phase7-1/device'),{recursive:true});fs.writeFileSync(path.join(root,'docs/benchmarks/phase7-1/device/build.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));});
