// Fifty deliberately synthetic TEXT pairs. Not photos, live inference or calibrated confidence.
const {rankDuplicate}=require('../dist/src/ai/duplicate-detection.service');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const cases=['دوف','نيفيا','بانتين','سوني','سامسونج'].flatMap(brand=>[
  [`${brand} شامبو ٤٠٠ مل`,`${brand} شامبو 400 ml`,true],
  [`${brand} شامبو 400 ml`,`${brand} شامبو 500 ml`,false],
  [`${brand} شامبو 1 l`,`${brand} شامبو 1000 ml`,true],
  [`${brand} شامبو 400 ml`,`${brand} شامبو`,false],
  [`${brand} جهاز X100 128gb اسود`,`${brand} جهاز X100 256gb اسود`,false],
  [`${brand} جهاز X100 128gb اسود`,`${brand} جهاز X100 128gb ابيض`,false],
  [`${brand} جهاز X100 128gb اسود`,`${brand} جهاز X200 128gb اسود`,false],
  [`${brand} جهاز X100 128gb اسود`,`${brand} جهاز X100 128gb black`,true],
  [`${brand} شامبو 400 ml pack 2`,`${brand} شامبو 400 ml pack 4`,false],
  [`${brand} شامبو 400 ml`,`${brand} شامبو 400 ml`,true],
]);
const rows=cases.map(([query,candidate,gold])=>({query,candidate,gold,...rankDuplicate(query,candidate)}));
const tp=rows.filter(r=>r.gold&&r.strong).length,fp=rows.filter(r=>!r.gold&&r.strong).length,
  fn=rows.filter(r=>r.gold&&!r.strong).length,tn=rows.filter(r=>!r.gold&&!r.strong).length;
assert.equal(rows.length,50);assert.equal(fp,0);assert.equal(fn,0);
const result={time:new Date().toISOString(),scope:'Curated synthetic TEXT unit corpus: five repeated brand tokens × ten rule cases. NOT 50 photos/products. NOT Gemini quality.',
  counts:{tp,fp,fn,tn},precision:tp/(tp+fp),recall:tp/(tp+fn),liveRecognitionAccuracy:'NOT_VERIFIED',calibration:'NONE',rows};
fs.writeFileSync(path.resolve(__dirname,'../docs/benchmarks/phase6/matching-text-evaluation.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({scope:result.scope,counts:result.counts,precision:result.precision,recall:result.recall}));
