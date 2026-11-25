const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),mobile=path.resolve(root,'../AboEssaMobile'),m=JSON.parse(fs.readFileSync('D:/rezona-phase7-3-qa/pilot-manifest.json','utf8'));
const result=JSON.parse(fs.readFileSync(path.join(m.dir,'pilot-result.json'),'utf8'));
const key=require('dotenv').parse(fs.readFileSync('D:/rezona-phase7-2-qa/fal-pilot/backend.env')).FAL_KEY.trim();
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(fs.readdirSync('D:/rezona-phase7-3-qa/authorized-style-attempts').length,result.realRequests);
const files=['.env.phase7-3-style.example','src/image-enhancement/brand-studio.config.ts','src/image-enhancement/brand-studio-codec.ts','src/image-enhancement/fal-studio.config.ts','src/image-enhancement/fal-studio.provider.ts','src/image-enhancement/enhancement.provider.ts','src/image-enhancement/enhancement.service.ts','src/ai/recognition-budget.service.ts','src/product-intake/intake-enhancement.controller.ts','tests/unit/tabletop-styles.spec.ts',
 'scripts/phase7-3-style-pilot.cjs','scripts/phase7-3-readonly-audit.cjs','scripts/phase7-3-mobile-checks.cjs','scripts/phase7-3-evidence.cjs','docs/rezona-phase-7-3-tabletop-styles.md'];
const mobileFiles=['apps/admin_app/lib/features/product_intake/intake_enhancement_card.dart','apps/admin_app/lib/features/product_intake/intake_repository.dart','apps/admin_app/test/intake_brand_studio_card_test.dart','apps/admin_app/test/intake_tabletop_styles_card_test.dart','apps/admin_app/test/intake_enhancement_test.dart'];
const records=[];
for(const[base,list]of[[root,files],[mobile,mobileFiles],[m.out,fs.readdirSync(m.out).filter(n=>/\.(json|log)$/.test(n))]])for(const name of list){const b=fs.readFileSync(path.join(base,name));assert.ok(!b.includes(Buffer.from(key)));records.push({file:path.join(base,name),bytes:b.length,sha256:sha(b)});}
for(const row of result.rows){const p=m.photos.find(p=>p.n===row.n);assert.equal(sha(fs.readFileSync(path.join(m.dir,row.prefix+'-original.jpeg'))),p.originalSha256);assert.equal(sha(fs.readFileSync(path.join(m.dir,row.prefix+'-mask.png'))),p.maskHash);}
const snapshot='implementation-report-initial.md';for(const dir of[m.dir,m.out])fs.copyFileSync(path.join(root,'docs/rezona-phase-7-3-tabletop-styles.md'),path.join(dir,snapshot),fs.constants.COPYFILE_EXCL);
const proof={sealedAt:new Date().toISOString(),stage:'Initial three attempts; continuation decision pending',sourceRecords:records,
 originalAndApprovedMasksUnchanged:true,actualKeyValueFound:false,realRequests:result.realRequests,regenerations:0,newProducts:0,automaticPublication:false,
 productionDeployment:false,githubPush:false,oldUnknownReservationReleased:false,missingRealComparisons:'Warm TECLAST unknown; warm soap and modern both unattempted',noFurtherPaidUseWithoutOwnerContinuationDecision:true};
for(const dir of[m.dir,m.out])fs.writeFileSync(path.join(dir,'evidence-initial.json'),JSON.stringify(proof,null,2),{flag:'wx'});
console.log(JSON.stringify({sealed:true,records:records.length,realRequests:result.realRequests,privateBoards:path.join(m.dir,'review.html'),report:path.join(root,'docs/rezona-phase-7-3-tabletop-styles.md')}));
