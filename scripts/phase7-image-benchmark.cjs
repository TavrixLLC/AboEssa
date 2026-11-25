if (process.env.REZONA_PHASE7_QA !== '1') throw Error('Explicit Phase7 QA only');
const fs = require('node:fs/promises'), path = require('node:path'), { createHash } = require('node:crypto'), sharp = require('sharp');
const { isolatedEnhancement } = require('../dist/src/image-enhancement/enhancement-isolate');
const root = path.resolve(__dirname, '..'), privateOut = 'D:/rezona-phase7-qa/quality';
const hash = b => createHash('sha256').update(b).digest('hex');
const p95 = xs => [...xs].sort((a,b) => a-b)[Math.max(0,Math.ceil(xs.length*.95)-1)];
(async () => {
  await fs.mkdir(privateOut, { recursive: true });
  const real = await fs.readFile('D:/rezona-phase5-qa/physical-upload-original.jpg'); // Authorized existing QA photo, READ ONLY.
  const samples = [{ id: 'existing-physical-product-photo', bytes: real, mime: 'image/jpeg', real: true }];
  const colors = ['#164b3e', '#1c1c1c', '#ffffff', '#aeb7be', '#deb150', '#cc4d62', '#2c4380', '#8b4a29'];
  for (let i = 0; i < colors.length; i++) {
    const svg = `<svg width="1600" height="1200"><rect x="450" y="100" width="700" height="1000" rx="${i*8}" fill="${colors[i]}" stroke="#777" stroke-width="3"/><text x="510" y="450" font-size="105" fill="${i===2?'#444':'white'}">QA ONLY ${i}</text><text x="530" y="590" font-size="45" fill="${i===2?'#444':'white'}">400 ml — model A${i}</text>${i===7?'<path d="M300 200L300 1000L250 900" stroke="#333" stroke-width="5" fill="none"/>':''}</svg>`;
    samples.push({ id: 'synthetic-shape-' + i, bytes: await sharp(Buffer.from(svg)).png().toBuffer(), mime: 'image/png', real: false });
  }
  const rows = [];
  for (const sample of samples) for (const mode of ['CLEAN', 'BACKGROUND_REMOVE']) {
    for (let repeat = 0; repeat < 3; repeat++) {
      const started = performance.now();
      try {
        const out = await isolatedEnhancement({ bytes: sample.bytes, mime: sample.mime, mode, matting: true, background: 'WHITE' });
        const variants = [];
        for await (const variant of require('../dist/src/image-optimization/image-codec').encodeVariants(out.png, 'image/png')) variants.push(variant);
        if (repeat === 0) await fs.writeFile(path.join(privateOut, `${sample.id}-${mode}.png`), out.png);
        rows.push({ sample: sample.id, real: sample.real, mode, repeat, success: true, totalWithVariantsMs: Math.round(performance.now()-started), metrics: out.metrics, variantBytes: variants.reduce((a,v)=>a+v.body.length,0), originalBytes: sample.bytes.length, outputHash: hash(out.png), warnings: out.warnings });
      } catch (e) { rows.push({ sample: sample.id, real: sample.real, mode, repeat, success: false, totalMs: Math.round(performance.now()-started), error: /^[A-Z0-9_]+$/.test(e.message) ? e.message : 'CODEC_FAILED' }); }
    }
  }
  const clean = rows.filter(r => r.mode==='CLEAN' && r.success);
  const result = { time: new Date().toISOString(), scope: 'Local Windows child + Sharp codecs, CPU not physical Android; no external processing', distinctRealPhotos: 1, syntheticShapes: 8, fiftyRealProductsEvaluated: false, repetitionsAreNotDistinctProducts: true, externalCalls: 0, actualBilled: null, metrics: { cleanP95WithVariantsMs: p95(clean.map(r=>r.totalWithVariantsMs)), cleanP95ChildMs: p95(clean.map(r=>r.metrics.elapsedMs)), cleanMaxChildRssSnapshotBytes: Math.max(...clean.map(r=>r.metrics.rssBytes)), cleanP95CpuMicros: p95(clean.map(r=>r.metrics.cpuMicros)), cleanMeanStorageBytes: Math.round(clean.reduce((a,r)=>a+r.metrics.outputBytes+r.variantBytes+r.originalBytes,0)/clean.length) }, quality: { employeeAcceptance: 'NOT_TESTED', liveAiQuality: 'UNVERIFIED', humanIdentityAcceptanceRate: null, note: 'One cluttered real QA photo; deterministic CLEAN preserves entire scene. Local matting deliberately refuses clutter. Synthetic matte successes do not establish reflective/transparent/warehouse quality.' }, rows };
  await fs.mkdir(path.join(root, 'docs/benchmarks/phase7'), { recursive: true }); await fs.writeFile(path.join(root, 'docs/benchmarks/phase7/local-benchmark.json'), JSON.stringify(result,null,2)); console.log(JSON.stringify({ metrics: result.metrics, realPhotos:1, rows:rows.length, successes:rows.filter(r=>r.success).length }));
})().catch(e=>{console.error(e); process.exitCode=1;});
