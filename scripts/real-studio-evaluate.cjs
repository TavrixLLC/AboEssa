const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { createHash } = require('node:crypto'),
  m = JSON.parse(fs.readFileSync('D:/rezona-real-studio-qa/manifest.json', 'utf8'));
// Human-readable visual QA findings from actual original/automatic/guided boards.
// These are agent QA observations, NOT an employee acceptance or paid-transfer approval.
const findings = {
  P01: [
    'AUTO',
    true,
    false,
    'عزل العبوة كاملة ظاهرياً؛ الكتابة والاصفرار الموجود بالأصل محفوظان. يحتاج اعتماد الموظف وفحص الأطراف الدقيقة.',
  ],
  P02: [
    'AUTO',
    true,
    false,
    'عزل العبوة كاملة ظاهرياً دون اختراع الجهاز خارج العبوة؛ النص الرئيسي محفوظ. بانتظار الموظف.',
  ],
  P03: [
    'GUIDED',
    false,
    true,
    'فشل العزل التلقائي بفحص المساحة. التوجيه أعاد معظم العبوة، لكن طرفها الأيسر مقصوص عند حافة التصوير؛ أعد تصوير العبوة كاملة. ادعاءات العلاج المطبوعة غير متحققة.',
  ],
  P04: [
    'GUIDED',
    false,
    true,
    'التلقائي ضم جزءاً من الطاولة، والتوجيه عزل صورة الشاحن المطبوعة بدلاً من العبوة الفعلية؛ لا يجوز تقديم الرسم كجهاز مصوّر. أعد التصوير بخلفية أبسط وهامش كامل.',
  ],
  P05: [
    'AUTO',
    false,
    true,
    'العبوة مقصوصة عند حدود الصورة واليد تحجب طرفاً؛ الخلفية البيضاء لا تعيد الأجزاء المفقودة. أعد التصوير كاملاً.',
  ],
  P06: [
    'GUIDED',
    true,
    false,
    'التوجيه أزال أرضية زائدة مع بقاء الهيكل والبطاقة والمقبض والعجلات ظاهرياً؛ راجع الأطراف والانعكاسات قبل الاعتماد.',
  ],
  P07: [
    'AUTO',
    false,
    true,
    'العبوة تلامس وتتجاوز حدود التصوير، خاصة الجانبين؛ لا يمكن اعتبار القناع صورة كاملة للمنتج. أعد التصوير مع فراغ حولها.',
  ],
  P08: [
    'AUTO',
    false,
    true,
    'قناع التلقائي يحتفظ بمساحة أرضية واسعة بين قطع الطقم، والعمود يصل لحافة الصورة السفلية؛ لا يمكن تأكيد الطقم كاملاً. أعد تصوير كل القطع والكابل داخل الإطار.',
  ],
  P09: [
    'AUTO',
    false,
    true,
    'التلقائي يحتفظ بأرضية بين الملحقات؛ التوجيه أفقد معظم المقابض والمفاتيح والملحقات. لا نختار العبوة وحدها كتمثيل للطقم؛ أعد ترتيب جميع القطع على خلفية موحدة.',
  ],
  P10: [
    'AUTO',
    true,
    false,
    'الكنزة المفرودة والبطاقة والملمس واللون محفوظة ظاهرياً؛ لا توجد أدلة لحجم مانيكان، لذلك F04 غير متوافق. راجع الثقوب الدقيقة وحواف الأكمام.',
  ],
  P11: [
    'AUTO',
    false,
    false,
    'ظهرت الأغطية المتعددة، لكن البلاستيك الشفاف واللمعان والفتحات تحمل خلفية وتحتاج مراجعة تفصيلية؛ لا نعتمد فصل الشفافية أو عدد القطع بالمخزون من الصورة.',
  ],
  P12: [
    'AUTO',
    true,
    false,
    'العبوة الكاملة محفوظة ظاهرياً؛ لا نصحّح ميل أو كتابة أو تلف تلقائياً. قارن بالقناع التاريخي المعتمد ثم اعتمد كمراجعة جديدة إن رغبت.',
  ],
  P13: [
    'GUIDED',
    false,
    true,
    'التلقائي والتوجيه التاريخي اختارا رسم البروجكتر وأجزاء من العبوة بدل كامل العبوة؛ بعض الحواف ضيقة/مقصوصة. أعد التصوير على خلفية أبسط.',
  ],
  P14: [
    'GUIDED',
    false,
    true,
    'كلا المسارين يختاران صورة المستقبل المطبوعة لا علبة UGREEN الكاملة؛ هذا ليس جهازاً مصوراً خارج العبوة. أعد تصوير العبوة كاملة مع هامش واضح.',
  ],
  P15: [
    'GUIDED',
    false,
    true,
    'العزل التلقائي والتوجيه يختاران الملصق فقط ويفقدان لوح التقطيع؛ لا قناع صالح للمنتج الكامل. أعد التصوير بخلفية ذات تباين أو راجع عزلاً تفصيلياً.',
  ],
  P16: [
    'AUTO',
    true,
    false,
    'علبة الصابون الكاملة وتصميمها محفوظان ظاهرياً؛ لا ندّعي محتويات أو خصائص غير مثبتة بالصورة. يحتاج الموظف مراجعة الحواف.',
  ],
  P17: [
    'GUIDED',
    false,
    true,
    'العزل يفقد الكرة الشفافة وأجزاء دقيقة بالخلف/العجلة؛ نجاح المهمة تقنياً لا يثبت اكتمال القطعة. أعد التصوير مع فصل وتباين للأجزاء الشفافة.',
  ],
};
const photos = m.photos.map((p) => {
  const admission = JSON.parse(
      fs.readFileSync(path.join(m.dir, 'admit-' + p.tag + '.json'), 'utf8'),
    ),
    f = findings[p.tag];
  assert.ok(f);
  const gfile = path.join(m.dir, 'guided-' + p.tag + '.json'),
    guided = fs.existsSync(gfile) ? JSON.parse(fs.readFileSync(gfile, 'utf8')) : null;
  const job = f[0] === 'GUIDED' ? guided?.job : admission.automatic;
  assert.ok(job?.candidate);
  const prior =
    p.tag === 'P12'
      ? 'D:/rezona-phase7-3-1-qa/20261122-2ea9d93d/product-1-approved-mask.png'
      : p.tag === 'P16'
        ? 'D:/rezona-phase7-3-1-qa/20261122-2ea9d93d/product-5-approved-mask.png'
        : null;
  const priorMatch = prior
    ? createHash('sha256').update(fs.readFileSync(prior)).digest('hex') ===
      job.candidate.processingDetails.maskHash
    : null;
  return {
    photoId: p.photoId,
    tag: p.tag,
    filename: p.filename,
    label: p.label,
    sha256: p.sha256,
    sourceStatus: f[2] ? 'RECAPTURE_NEEDED' : 'ADMITTED_IMMUTABLE_ORIGINAL',
    sessionId: admission.sessionId,
    clientImageId: p.imageId,
    sourceCandidateId: job.candidate.id,
    automaticCandidateId: admission.automatic.candidate?.id ?? null,
    guidedCandidateId: guided?.job.candidate?.id ?? null,
    sourceHash: admission.sourceHash,
    maskHash: job.candidate.processingDetails.maskHash,
    suggestedGroup: p.suggestedGroup,
    sourceKind: p.tag === 'P15' ? 'HOME_OBJECT' : p.sourceKind,
    recommendedTemplateId: p.recommendedTemplateId,
    templateVersion: 1,
    placement: p.placement,
    segmentationStatus: f[1] ? 'READY_FOR_REVIEW' : 'SEGMENTATION_REVIEW_REQUIRED',
    segmentationMethod: f[0] === 'GUIDED' ? 'GUIDED_REAL_ONNX' : 'AUTOMATIC_REAL_ONNX',
    reasonAr: f[3],
    previewAllowed: f[1] && !f[2],
    employeeReview: 'PENDING',
    providerStatus: 'REAL_FAL_NOT_AUTHORIZED',
    priorQaProductId: p.existingQaProductId,
    priorApprovedMaskHashMatches: priorMatch,
    statusLabels: [
      ...(f[2] ? ['RECAPTURE_NEEDED'] : []),
      f[1] ? 'READY_FOR_REVIEW' : 'SEGMENTATION_REVIEW_REQUIRED',
      'REAL_FAL_NOT_AUTHORIZED',
    ],
    assessment: 'AGENT_VISUAL_QA_NOT_EMPLOYEE_APPROVAL',
    automaticOutcome: admission.automatic.status,
    automaticError: admission.automatic.errorCode,
    automaticWarnings: admission.automatic.candidate?.warnings ?? [],
    guidedWarnings: guided?.job.candidate?.warnings ?? [],
  };
});
const index = {
  datasetId: m.id,
  evaluatedAt: new Date().toISOString(),
  photos,
  method: 'REAL_ONNX_AND_AGENT_VISUAL_COMPARISON; NO EMPLOYEE ACCEPTANCE',
  paidCalls: 0,
};
fs.writeFileSync(path.join(m.dir, 'review-index.json'), JSON.stringify(index, null, 2), {
  flag: 'wx',
});
fs.writeFileSync(path.join(m.out, 'per-photo-evaluation.json'), JSON.stringify(index, null, 2), {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    total: photos.length,
    previewReady: photos.filter((p) => p.previewAllowed).length,
    recapture: photos.filter((p) => p.sourceStatus === 'RECAPTURE_NEEDED').length,
    segmentationReview: photos.filter(
      (p) => p.segmentationStatus === 'SEGMENTATION_REVIEW_REQUIRED',
    ).length,
    paidAuthorized: 0,
  }),
);
