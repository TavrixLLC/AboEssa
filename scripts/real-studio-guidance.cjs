const fs = require('node:fs'),
  path = require('node:path'),
  m = JSON.parse(fs.readFileSync('D:/rezona-real-studio-qa/manifest.json', 'utf8'));
const plans = {
  P03: {
    region: { x: 0, y: 0.23, width: 1, height: 0.37 },
    reason:
      'Box ROI after automatic area rejection; cropped source boundary still requires recapture review',
  },
  P04: {
    region: { x: 0.03, y: 0.17, width: 0.97, height: 0.55 },
    reason:
      'Include retail box; exclude detached wood/floor selected automatically; preserve source clipping warning',
  },
  P06: {
    region: { x: 0.015, y: 0.025, width: 0.97, height: 0.945 },
    reason:
      'Include suitcase handle, tag and all wheels, exclude distant floor; no manual mask painted',
  },
  P09: {
    region: { x: 0.135, y: 0.015, width: 0.74, height: 0.89 },
    reason:
      'Include box, both handles, keys/tags/screws/cable; multi-part completeness remains a review gate',
  },
};
for (const p of m.photos.filter((p) => ['P13', 'P14', 'P15', 'P17'].includes(p.tag)))
  if (p.historicalGuidedRegion)
    plans[p.tag] = {
      region: p.historicalGuidedRegion,
      reason:
        'Reuse exact previously authorized guided rectangle, not a synthetic mask; still re-evaluate actual ONNX output',
    };
const result = Object.entries(plans).map(([tag, v]) => ({
  photoId: m.photos.find((p) => p.tag === tag).photoId,
  tag,
  ...v,
  employeeApproval: 'PENDING',
  method: 'QA_VISUAL_RECTANGLE_REVIEW_NOT_EMPLOYEE_FINAL_APPROVAL',
}));
fs.writeFileSync(path.join(m.dir, 'guided-plan.json'), JSON.stringify(result, null, 2), {
  flag: 'wx',
});
console.log(
  JSON.stringify({ guidedAttempts: result.length, tags: result.map((p) => p.tag), paidCalls: 0 }),
);
