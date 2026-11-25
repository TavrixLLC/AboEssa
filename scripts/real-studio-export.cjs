const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
module.exports = async ({ request, ok, m }) => {
  const response = await ok(request('GET', '/admin/product-intake/studio-review'), 200);
  assert.equal(response.photos.length, 17);
  const catalog = await ok(
    request(
      'GET',
      '/admin/product-intake/sessions/' +
        response.photos[0].sessionId +
        '/enhancements/studio/templates',
    ),
    200,
  );
  const dir = path.join(m.dir, 'admin-evidence-' + Date.now());
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'response.json'), JSON.stringify(response, null, 2), {
    flag: 'wx',
  });
  fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify(catalog, null, 2), {
    flag: 'wx',
  });
  const esc = (v) =>
    String(v)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"><html lang="ar" dir="rtl"><title>ريزونا — تقرير مراجعة الصور الحقيقيّة الخاص</title><style>body{background:#0c0f0f;color:#f4f4f1;font:17px Arial;margin:24px}h1,h2{color:#e7bc61}article{border:1px solid #505853;border-radius:10px;padding:18px;margin:18px 0}section{display:flex;flex-wrap:wrap;gap:14px}figure{margin:0;flex:1;min-width:210px}img{width:100%;height:310px;object-fit:contain;background:#202625}figcaption{color:#e7bc61}code{direction:ltr;display:block;overflow-wrap:anywhere}.bad{color:#ffbb86}</style><h1>17 صورة حقيقية — تقرير خاص من بيئة QA</h1><p>هذا ملف أدلة محلي، وليس تطبيقاً آخر. واجهة المراجعة مدمجة داخل أدمن ريزونا. لا صور fal جديدة ولا مخزون ولا اعتماد تلقائي. LOCAL PREVIEW غير معتمدة.</p>${response.photos
    .map((p) => {
      const source = m.photos.find((x) => x.photoId === p.photoId),
        method = p.segmentationMethod === 'GUIDED_REAL_ONNX' ? 'guided' : 'auto',
        preview = fs.existsSync(path.join(m.dir, 'media', p.tag + '-LOCAL-PREVIEW.webp'));
      return `<article id="${p.tag}"><h2>${p.tag} — ${esc(p.label)}</h2><p class="${p.previewAllowed ? '' : 'bad'}">${esc(p.statusLabels.join(' / '))}</p><p>${esc(p.reasonAr)}</p><p>المجموعة ${esc(p.suggestedGroup)} · القالب المقترح ${esc(p.recommendedTemplateId)} v1 · مراجعة الموظف PENDING</p><section><figure><img src="originals/${path.basename(source.original)}"><figcaption>الأصل — غير معدل</figcaption></figure><figure><img src="media/${p.tag}-${method}-candidate.webp"><figcaption>ONNX محلي — ${method} — غير معتمد</figcaption></figure>${preview ? `<figure><img src="media/${p.tag}-LOCAL-PREVIEW.webp"><figcaption>LOCAL PREVIEW — ليست ناتج fal</figcaption></figure>` : '<figure><p>لا معاينة كتالوجية: المصدر أو العزل غير آمن؛ الأصل محفوظ.</p></figure>'}</section><p>REAL FAL: NOT YET GENERATED / REAL_FAL_NOT_AUTHORIZED</p><details><summary>هوية المصدر والتوافق</summary><code>${esc(p.filename)}<br>SHA256 ${p.sha256}<br>${p.photoId}</code><p>${p.compatibility.map((t) => `${esc(t.nameAr)} v${t.version}: ${t.compatibleModes.length ? esc(t.compatibleModes.join(', ')) : 'غير متوافق'}`).join('<br>')}</p></details></article>`;
    })
    .join('')}</html>`;
  const gallery=process.env.REAL_STUDIO_GALLERY_FILE||'review-gallery.html';assert.match(gallery,/^review-gallery(?:-final)?\.html$/);
  let finalHtml=html;
  for(const p of response.photos){
    const attempts=['auto','guided','clean'].filter(method=>fs.existsSync(path.join(m.dir,'media',p.tag+'-'+method+'-candidate.webp'))).map(method=>`<figure><img src="media/${p.tag}-${method}-candidate.webp"><figcaption>${method==='clean'?'تنظيف محلي للصورة الأصلية — ليس عزلاً':method==='guided'?'GUIDED: قناع ONNX حقيقي غير معتمد':'AUTOMATIC: قناع ONNX حقيقي غير معتمد'}</figcaption></figure>`).join('');
    finalHtml=finalHtml.replace(`<article id="${p.tag}">`,`<article id="${p.tag}"><details><summary>جميع محاولات العزل والتراجع المحلي لهذه الصورة</summary><section>${attempts}</section></details>`);
  }
  fs.writeFileSync(path.join(m.dir, gallery), finalHtml, { flag: 'wx' });
  fs.writeFileSync(
    path.join(m.out, gallery==='review-gallery.html'?'admin-gallery.json':'admin-gallery-final.json'),
    JSON.stringify(
      {
        privateGallery: path.join(m.dir, gallery),
        adminEvidence: dir,
        photos: 17,
        realFalResults: 0,
        employeeApprovals: 0,
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  console.log(
    JSON.stringify({ privateGallery: path.join(m.dir, gallery), adminEvidence: dir }),
  );
};
