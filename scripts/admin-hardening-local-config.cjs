// Read only the owner-authorized signing metadata; never emit passwords/key bytes.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),{X509Certificate,createHash}=require('node:crypto');
const m=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync('D:/rezona-admin-hardening/active.json','utf8')).manifest,'utf8'));
const signingPath='C:/Users/3ma/Documents/aboessa-secrets/shanasheel-customer-upload-signing.json',s=JSON.parse(fs.readFileSync(signingPath,'utf8'));
const java='C:/Program Files/Android/Android Studio/jbr',keytool=path.join(java,'bin/keytool.exe');
function cert(file,alias,password){const r=spawnSync(keytool,['-exportcert','-rfc','-keystore',file,'-alias',alias,'-storepass:env','REZONA_CERT_READ_PASSWORD'],{env:{...process.env,REZONA_CERT_READ_PASSWORD:password},windowsHide:true,encoding:'utf8'});if(r.status!==0)return{read:false};const pem=r.stdout.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);return pem?{read:true,sha256:new X509Certificate(pem[0]).fingerprint256.replaceAll(':','').toLowerCase()}:{read:false};}
const customer=cert(s.keystorePath,s.keyAlias,s.storePassword),debug=cert('C:/Users/3ma/.android/debug.keystore','androiddebugkey','android');
const apk=path.resolve(__dirname,'../../AboEssaMobile/apps/admin_app/build/app/outputs/flutter-apk/app-release.apk');
const r=spawnSync('cmd.exe',['/d','/c','C:/Users/3ma/AppData/Local/Android/Sdk/build-tools/37.0.0/apksigner.bat','verify','--print-certs',apk],{env:{...process.env,JAVA_HOME:java},windowsHide:true,encoding:'utf8'});
const apkDigest=r.stdout.match(/certificate SHA-256 digest:\s*([a-f0-9]{64})/i)?.[1].toLowerCase();
const result={at:new Date().toISOString(),customerSigningMetadataFound:true,customerKeystoreFound:fs.existsSync(s.keystorePath),customerCertificate:customer,debugCertificate:debug,historicalAdminApk:{verified:r.status===0,sha256:createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),certificateSha256:apkDigest,package:'com.singlestore.admin_app',version:'1.0.0+1'},matchesCustomerKey:!!apkDigest&&apkDigest===customer.sha256,matchesDebugKey:!!apkDigest&&apkDigest===debug.sha256,installedProductionAdminOnAttachedTablet:false,keystoreModified:false,replacementKeyCreated:false};
fs.writeFileSync(path.join(m.out,'local-signing-discovery.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
s.storePassword=s.keyPassword='';
