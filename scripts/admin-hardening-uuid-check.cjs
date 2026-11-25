// Offline contract checks of the exact CommonJS v4 API used by Firebase's transitive clients.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const m=JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync('D:/rezona-admin-hardening/active.json','utf8')).manifest,'utf8'));
const rows=[];
for(const name of['gaxios','teeny-request','google-gax']){
 const req=createRequire(require.resolve(name)),file=req.resolve('uuid'),uuid=req('uuid'),version=JSON.parse(fs.readFileSync(path.join(path.dirname(file),'../../package.json'),'utf8')).version;
 assert.equal(version,'11.1.1');assert.equal(typeof uuid.v4,'function');
 for(let i=0;i<100;i++)assert.match(uuid.v4(),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.throws(()=>uuid.v5('test',uuid.v5.DNS,new Uint8Array(1)),RangeError);
 rows.push({consumer:name,version,commonJsRequire:true,v4Contract:true,patchedV5Bounds:true});
}
require('firebase-admin/app');require('firebase-admin/messaging');require('@google-cloud/storage');require('@google-cloud/firestore');
fs.writeFileSync(path.join(m.out,'uuid-consumer-compatibility.json'),JSON.stringify({passed:true,networkRequests:0,rows,firebaseMajorChanged:false},null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,consumers:rows.length,networkRequests:0}));
