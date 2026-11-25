// Local-only validation/evidence. No provider account reads, inference, deploy, install or DB writes.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), m = JSON.parse(fs.readFileSync('D:/rezona-phase7-3-1-qa/local-manifest.json', 'utf8'));
const old = JSON.parse(fs.readFileSync('D:/rezona-phase7-3-qa/pilot-manifest.json', 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex'), stamp = Date.now(), mode = process.argv[2];
global.fetch = () => { throw Error('PHASE731_NO_PROVIDER_OR_EXTERNAL_READS'); };
const write = (name, data) => fs.writeFileSync(path.join(m.out, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2), {flag:'wx'});
const backendFiles = ['src/image-enhancement/tabletop-placement.ts', 'src/image-enhancement/tabletop-scenes.ts', 'src/image-enhancement/tabletop-native-codec.ts', 'src/image-enhancement/brand-studio.config.ts', 'src/image-enhancement/brand-studio-codec.ts', 'src/image-enhancement/enhancement-codec.ts', 'src/image-enhancement/enhancement.provider.ts', 'src/image-enhancement/enhancement.service.ts', 'src/image-enhancement/fal-studio.config.ts', 'src/image-enhancement/fal-studio.provider.ts', 'src/ai/recognition-budget.service.ts', 'src/product-intake/intake-enhancement.controller.ts', 'tests/unit/tabletop-styles.spec.ts', 'tests/unit/tabletop-placement.spec.ts', 'scripts/phase7-3-style-pilot.cjs', 'scripts/phase7-3-1-local-concepts.cjs', 'scripts/phase7-3-1-validation.cjs', '.env.phase7-3-1.example', '.gitignore', 'docs/rezona-phase-7-3-1-tabletop-visual-refinement.md'];
const mobileFiles = ['lib/features/product_intake/intake_enhancement_card.dart', 'lib/features/product_intake/intake_repository.dart', 'test/intake_tabletop_styles_card_test.dart', 'test/intake_enhancement_test.dart'];
const app = path.resolve(root, '../AboEssaMobile/apps/admin_app');
function command(name, executable, args, cwd = root, overrides = {}) {
  const env = {...process.env, ...overrides}; if (!overrides.REZONA_TABLETOP_RENDER_DIR) delete env.REZONA_TABLETOP_RENDER_DIR;
  const result = spawnSync(executable, args, { cwd, env, encoding:'utf8', windowsHide:true, timeout:240000, maxBuffer:32*1024*1024 });
  const log = (result.stdout ?? '') + '\n' + (result.stderr ?? '');
  write(`${name}-${stamp}.log`, log);
  console.log(JSON.stringify({name, exit:result.status, summary:log.trim().split(/\r?\n/).slice(-5)}));
  if (result.status !== 0) throw Error(name.toUpperCase() + '_FAILED');
}
async function audit() {
  const {PrismaClient, Prisma} = require('@prisma/client');
  const cfg = JSON.parse(fs.readFileSync('D:/rezona-phase7-2-qa/20261122-6470081b/runtime-secrets.json', 'utf8'));
  const client = db => new PrismaClient({datasources:{db:{url:`postgresql://phase72_qa:${encodeURIComponent(cfg.postgresPassword)}@127.0.0.1:55454/${db}`}},log:[]});
  const a = client(old.db), b = client('rezona_phase72_fal_84a2de4a');
  let current, previous;
  try {
    current = await a.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const usages = await tx.recognitionUsage.findMany({select:{status:true,committedUsd:true,reservedUsd:true,actualBilledUsd:true}});
      const jobs = await tx.productImageEnhancementJob.findMany({where:{provider:'fal'},select:{status:true,sourceHash:true,parameters:true}});
      assert.equal(usages.length, 3); assert.equal(jobs.length, 3);
      assert.equal(usages.filter(x=>x.status==='UNKNOWN').length, 1);
      const warm = jobs.find(x=>x.status==='UNKNOWN'); assert.ok(warm);
      assert.equal(warm.parameters.stylePreset, 'REZONA_STYLE_WARM_PREMIUM_TABLE_V1');
      assert.equal(warm.sourceHash, m.photos.find(p=>p.n===1).sourceHash);
      const crossRevisionFenceCount = await tx.recognitionUsage.count({where:{purpose:'IMAGE_EDIT',provider:'fal',status:{not:'NOT_DISPATCHED'},enhancementJob:{mode:'GEMINI_BRAND_STUDIO',sourceHash:warm.sourceHash,parameters:{path:['stylePreset'],equals:warm.parameters.stylePreset}}}});
      assert.equal(crossRevisionFenceCount,1); // Stable preset, not a revision-specific style hash.
      assert.ok(usages.every(x=>x.actualBilledUsd===null));
      const committed = usages.reduce((s,x)=>s.add(x.committedUsd),new Prisma.Decimal(0)).toString(); assert.equal(committed,'0.52224');
      const untouched = {};
      for (const model of ['productListing','customer','customerWallet','walletEntry','order','auction','inventoryBalance','inventoryMovement','inventoryAllocation','warehouse','warehouseLocation']) {
        untouched[model] = await tx[model].count(); assert.equal(untouched[model],0);
      }
      assert.equal(await tx.productImageEnhancementDecision.count({where:{selectedCandidate:{job:{provider:'fal'}}}}),0);
      const sessions = await tx.productIntakeSession.findMany({select:{status:true,quantity:true,locationId:true,completedProductId:true}});
      assert.ok(sessions.every(x=>x.status==='DRAFT' && x.quantity===null && x.locationId===null && x.completedProductId===null));
      assert.equal(await tx.fileAsset.count({where:{OR:[{intakePrivate:false},{intakeProductId:{not:null}}]}}),0);
      return {usages,jobs,untouched,sessions,committed,crossRevisionFenceCount,allAssetsPrivate:true,allStyledApprovalsPending:true,unresolvedSourcePresets:[{sourceHash:warm.sourceHash,preset:warm.parameters.stylePreset}]};
    });
    previous = await b.$transaction(async tx=>{
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const u = await tx.recognitionUsage.findMany({select:{status:true,committedUsd:true,actualBilledUsd:true}});
      const committed=u.reduce((s,x)=>s.add(x.committedUsd),new Prisma.Decimal(0)).toString();assert.equal(committed,'0.34816');assert.equal(u.filter(x=>x.status==='UNKNOWN').length,1);
      return {committed,usage:u,unknownReleased:false};
    });
  } finally {await a.$disconnect(); await b.$disconnect();}
  assert.equal(fs.readdirSync('D:/rezona-phase7-3-qa/authorized-style-attempts').length,3);
  for (const h of m.historical) assert.equal(sha(fs.readFileSync(h.file)),h.sha256);
  for (const h of m.businessBaseline) assert.equal(sha(fs.readFileSync(path.join(root,h.file))),h.sha256);
  const original = JSON.parse(fs.readFileSync(path.join(old.dir,'pilot-result.json'),'utf8'));
  const unattempted = [
    {n:5,preset:'REZONA_STYLE_WARM_PREMIUM_TABLE_V1'},
    {n:1,preset:'REZONA_STYLE_MODERN_SOFT_STUDIO_V1'},
    {n:5,preset:'REZONA_STYLE_MODERN_SOFT_STUDIO_V1'},
  ];
  for (const u of unattempted) assert.ok(!original.rows.some(r=>r.n===u.n && r.preset===u.preset));
  const output={reviewedAt:new Date().toISOString(),networkCalls:0,newPaidRequests:0,actualTotalChargeUsd:null,incrementalPhase731CostUsd:'0',reservationIsNotCharge:true,current,previous,aggregateCommitmentUsd:'0.870400',unknownWarmRetried:false,unattempted,priorEvidenceUnchanged:true,businessBaselineUnchanged:true};
  write(`readonly-budget-audit-${stamp}.json`,output);
  const registry=path.join(m.dir,'unresolved-source-presets.json'), registryText=JSON.stringify(current.unresolvedSourcePresets,null,2);
  if(fs.existsSync(registry))assert.equal(fs.readFileSync(registry,'utf8'),registryText);
  else fs.writeFileSync(registry,registryText,{flag:'wx'});
  console.log(JSON.stringify({auditPassed:true,currentCommitted:current.committed,previousCommitted:previous.committed,actualTotal:'UNKNOWN',newPaidRequests:0,unattempted:3}));
}
async function main(){
  if(mode==='backend'){
    command('backend-unit',process.execPath,['node_modules/jest/bin/jest.js','--runInBand','--testPathPatterns=tests/unit']);
    command('backend-typecheck',process.execPath,['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']);
    command('backend-lint',process.execPath,['node_modules/eslint/bin/eslint.js',...backendFiles.filter(x=>x.endsWith('.ts'))]);
  } else if(mode==='static') {
    command('backend-typecheck',process.execPath,['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']);
    command('backend-lint',process.execPath,['node_modules/eslint/bin/eslint.js',...backendFiles.filter(x=>x.endsWith('.ts'))]);
  } else if(mode==='mobile') {
    const flutter='C:/Users/3ma/develop/flutter/bin/flutter.bat';
    command('admin-tests','cmd.exe',['/d','/c',flutter,'test','--no-pub','--reporter','expanded'],app);
    command('admin-analysis','cmd.exe',['/d','/c',flutter,'analyze','--no-pub',...mobileFiles],app);
  } else if(mode==='ui-render') {
    const output=path.join(m.dir,`controls-${stamp}`);fs.mkdirSync(output);
    command('admin-controls-render','cmd.exe',['/d','/c','C:/Users/3ma/develop/flutter/bin/flutter.bat','test','--no-pub','--reporter','expanded','test/intake_tabletop_styles_card_test.dart'],app,{REZONA_TABLETOP_RENDER_DIR:output});
    write(`controls-render-${stamp}.json`,{output,sizes:[320,834],renderOnlyArabicFont:'Arial alias, not production Cairo/icon acceptance',realProviderRequests:0});
  } else if(mode==='pixel-audit') {
    const sharp=require('sharp'),before=JSON.parse(fs.readFileSync(path.join(m.dir,'local-concepts.json'),'utf8')),rows=[];
    for (const p of m.photos) {
      const original=fs.readFileSync(path.join(m.dir,`product-${p.n}-original.jpeg`)),maskBytes=fs.readFileSync(path.join(m.dir,`product-${p.n}-approved-mask.png`));
      assert.equal(sha(original),p.originalSha256);assert.equal(sha(maskBytes),p.maskHash);
      const src=await sharp(original).autoOrient().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const mask=await sharp(maskBytes).removeAlpha().greyscale().raw().toBuffer();
      const styles=before.rows.filter(x=>x.n===p.n);assert.equal(new Set(styles.map(x=>x.details.foregroundHash)).size,1);
      for (const row of styles) {
        const g=row.details.placement,final=await sharp(fs.readFileSync(path.join(m.dir,row.file))).ensureAlpha().raw().toBuffer();
        let compared=0,mismatches=0;
        for (let y=0;y<src.info.height;y++) for(let x=0;x<src.info.width;x++) {
          const n=y*src.info.width+x,i=n*4;if(mask[n]<245||src.data[i+3]!==255)continue;
          const fx=g.foregroundOrigin.x+x-g.sourceMaskBox.left,fy=g.foregroundOrigin.y+y-g.sourceMaskBox.top;
          assert.ok(fx>=0&&fy>=0&&fx<g.canvasEdge&&fy<g.canvasEdge);
          const j=(fy*g.canvasEdge+fx)*4;compared++;
          if(src.data[i]!==final[j]||src.data[i+1]!==final[j+1]||src.data[i+2]!==final[j+2])mismatches++;
        }
        assert.equal(mismatches,0);assert.equal(compared,row.details.preparedOpaquePixels);
        rows.push({n:p.n,style:row.style,compared,mismatches,sourceToFinalDirect:true});
      }
    }
    write(`source-to-final-pixel-audit-${stamp}.json`,{verifiedAt:new Date().toISOString(),rows,opaqueSourceRgbUnchanged:true,approvedMasksUnchanged:true,sourcePhotosUnchanged:true});
    console.log(JSON.stringify({sourcePixelAuditPassed:true,styles:rows.length,mismatches:0}));
  } else if(mode==='replay') {
    const dist=path.join(m.dir,'validation-dist');assert.ok(!fs.existsSync(dist),'No-overwrite compiled replay');
    command('final-codec-build',process.execPath,['node_modules/typescript/bin/tsc','--project','tsconfig.build.json','--outDir',dist,'--incremental','false']);
    process.env.NODE_PATH=dist+path.delimiter+path.join(root,'node_modules');require('node:module').Module._initPaths();
    const {TABLETOP_STYLES}=require(path.join(dist,'src/image-enhancement/brand-studio.config.js'));
    const {isolatedEnhancement}=require(path.join(dist,'src/image-enhancement/enhancement-isolate.js'));
    const before=JSON.parse(fs.readFileSync(path.join(m.dir,'local-concepts.json'),'utf8')),rows=[];
    for (const p of m.photos) for (const s of TABLETOP_STYLES) {
      const source=fs.readFileSync(path.join(m.dir,`product-${p.n}-original.jpeg`)),mask=fs.readFileSync(path.join(m.dir,`product-${p.n}-approved-mask.png`));
      assert.equal(sha(source),p.originalSha256);assert.equal(sha(mask),p.maskHash);
      const r=await isolatedEnhancement({bytes:source,mask,mime:'image/jpeg',mode:'GEMINI_BRAND_STUDIO',background:'WHITE',matting:false,studioProfile:s.profile,placement:{camera:'TOP_DOWN',quarterTurns:0,horizontal:.5}});
      const oldRow=before.rows.find(x=>x.n===p.n&&x.style===s.profile.name);
      assert.ok(r.png.equals(fs.readFileSync(path.join(m.dir,oldRow.file))));
      assert.equal(r.details.opaqueRgbMismatches,0);
      rows.push({n:p.n,style:s.profile.name,sameMasterPng:true,sha256:sha(r.png),opaquePixels:r.details.preparedOpaquePixels,rgbMismatches:0,metrics:r.metrics});
    }
    write(`final-codec-replay-${stamp}.json`,{verifiedAt:new Date().toISOString(),rows,paidCalls:0,initialEvidenceUntouched:true});
    console.log(JSON.stringify({replayPassed:true,unchangedMasterPngs:rows.length,paidCalls:0}));
  } else if(mode==='audit') await audit();
  else if(mode==='seal') {
    for (const h of m.historical) assert.equal(sha(fs.readFileSync(h.file)),h.sha256);
    for (const h of m.businessBaseline) assert.equal(sha(fs.readFileSync(path.join(root,h.file))),h.sha256);
    const records=[];
    // Scan actual known credential value without recording it, the source env or any image.
    const key = require('dotenv').parse(fs.readFileSync('D:/rezona-phase7-2-qa/fal-pilot/backend.env')).FAL_KEY?.trim();
    assert.ok(key && key.length>20);
    const privateFiles=[];
    function walk(dir){for(const name of fs.readdirSync(dir)){if(name==='dist'||name==='validation-dist')continue;const full=path.join(dir,name);if(fs.statSync(full).isDirectory())walk(full);else privateFiles.push(path.relative(m.dir,full));}}
    walk(m.dir);
    for (const [base, files] of [[root,backendFiles],[app,mobileFiles],[m.out,fs.readdirSync(m.out)],[m.dir,privateFiles]]) {
      for (const file of files) {
        const full=path.join(base,file);if(!fs.statSync(full).isFile())continue;
        const bytes=fs.readFileSync(full);assert.ok(!bytes.includes(Buffer.from(key)));
        records.push({file:full,bytes:bytes.length,sha256:sha(bytes)});
      }
    }
    const report=fs.readFileSync(path.join(root,backendFiles.at(-1)));
    fs.writeFileSync(path.join(m.dir,'implementation-report-final.md'),report,{flag:'wx'});
    write(`evidence-final-${stamp}.json`,{sealedAt:new Date().toISOString(),records,actualKeyValueFound:false,priorEvidenceUnchanged:true,noProviderRequests:true,noDeployment:true,noGitPush:true,noInstallation:true,allEmployeeApprovalsPending:true});
    console.log(JSON.stringify({sealed:true,records:records.length,review:path.join(m.dir,'review.html')}));
  } else throw Error('INVALID_LOCAL_VALIDATION_MODE');
}
main().catch(e=>{console.error(/^[A-Z0-9_]{1,90}$/.test(e?.message??'')?e.message:'LOCAL_VALIDATION_REQUIRES_REVIEW');process.exitCode=1;});
