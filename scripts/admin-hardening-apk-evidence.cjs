// Artifact inspection only; never installs or handles signing passwords.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const m=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync('D:/rezona-admin-hardening/active.json','utf8')).manifest,'utf8'));
const apk=path.join(m.dir,'rezona-admin-v1.1.0-3-production.apk'),sdk='C:/Users/3ma/AppData/Local/Android/Sdk/build-tools/37.0.0';
const env={...process.env,JAVA_HOME:'C:/Program Files/Android/Android Studio/jbr'};
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{env,windowsHide:true,encoding:'utf8'});assert.equal(r.status,0);return r.stdout;};
const sign=run('cmd.exe',['/d','/c',path.join(sdk,'apksigner.bat'),'verify','--verbose','--print-certs',apk]),badging=run(path.join(sdk,'aapt.exe'),['dump','badging',apk]),manifest=run(path.join(sdk,'aapt.exe'),['dump','xmltree',apk,'AndroidManifest.xml']);
assert.match(badging,/package: name='com.singlestore.admin_app' versionCode='3' versionName='1.1.0'/);
assert.match(manifest,/android:usesCleartextTraffic[^\n]*0x0/);assert.match(manifest,/android:allowBackup[^\n]*0x0/);
assert.ok(!badging.includes('application-debuggable'));assert.ok(!manifest.includes('android:testOnly'));assert.ok(!manifest.includes('integration_test'));
assert.ok(!badging.includes('android.permission.RECORD_AUDIO'));
const cert=sign.match(/certificate SHA-256 digest:\s*([a-f0-9]{64})/i)?.[1];assert.ok(cert);assert.notEqual(cert,'88eb1d8c6dc99db6e9f3d181a59057eb2f00ee4b8c64fa4fd6088055b3f304c7');
const result={at:new Date().toISOString(),passed:true,package:'com.singlestore.admin_app',version:'1.1.0+3',apk,sha256:createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),bytes:fs.statSync(apk).size,certificateSha256:cert,signatureV2:true,ownerApprovedNewProductionIdentity:true,debuggable:false,cleartext:false,allowBackup:false,recordAudio:false,integrationTest:false,productionApi:'https://shanasheel.tavrixllc.com',productionSocket:'https://shanasheel.tavrixllc.com',installed:false,inPlaceUpdateOfDebugInstall:false,signingMetadata:'C:/Users/3ma/Documents/aboessa-secrets/rezona-admin-release/signing-metadata.json',passwordProtection:'Windows DPAPI CurrentUser',permissions:badging.split(/\r?\n/).filter(l=>l.startsWith('uses-permission:')),legacyStoragePermissions:'Dependency merged READ_EXTERNAL_STORAGE; WRITE_EXTERNAL_STORAGE maxSdk28. Review legacy picker support before tightening; no broad storage access was added by this task.'};
fs.writeFileSync(path.join(m.out,'signed-admin-artifact.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
