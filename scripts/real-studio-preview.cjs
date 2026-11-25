const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  sharp = require('sharp');
module.exports = async ({ db, request, ok, m }) => {
  const data = await ok(request('GET', '/admin/product-intake/studio-review'), 200);
  assert.equal(data.total, 17);
  const results = [];
  await ok(request('GET', '/admin/product-intake/studio-review', undefined, null), 401);
  const dataset = JSON.parse(fs.readFileSync(path.join(m.dir, 'review-index.json'), 'utf8'));
  for (const photo of data.photos) {
    assert.equal(photo.compatibility.length, 20);
    assert.equal(
      photo.compatibility.find((t) => t.id === 'REZONA_FASHION_GHOST_MANNEQUIN_V1').compatibleModes
        .length,
      0,
    );
    const url = '/admin/product-intake/studio-review/' + photo.photoId + '/local-preview',
      body = { templateId: photo.recommendedTemplateId, templateVersion: 1 };
    if (!photo.previewAllowed) {
      await ok(request('POST', url, body), 409);
      results.push({
        photoId: photo.photoId,
        tag: photo.tag,
        status: 'BLOCKED_UNSAFE_SOURCE_OR_MASK',
        paidStatus: 'REAL_FAL_NOT_AUTHORIZED',
      });
      continue;
    }
    const before = await db.productIntakeSession.findUniqueOrThrow({
      where: { id: photo.sessionId },
    });
    const result = await ok(request('POST', url, body));
    assert.equal(result.label, 'LOCAL PREVIEW');
    assert.equal(result.realFal, false);
    assert.equal(result.selectableCandidate, false);
    assert.equal(result.diagnostics.opaqueRgbMismatches, 0);
    const bytes = Buffer.from(result.base64, 'base64'),
      name = photo.tag + '-LOCAL-PREVIEW.webp';
    fs.writeFileSync(path.join(m.dir, 'media', name), bytes, { flag: 'wx' });
    const source = m.photos.find((p) => p.photoId === photo.photoId),
      candidate = path.join(
        m.dir,
        'media',
        photo.tag +
          '-' +
          (photo.segmentationMethod === 'GUIDED_REAL_ONNX' ? 'guided' : 'auto') +
          '-candidate.webp',
      );
    const inputs = [fs.readFileSync(source.original), fs.readFileSync(candidate), bytes],
      labels = [
        'ORIGINAL - UNCHANGED',
        'REAL LOCAL ONNX ISOLATION',
        'LOCAL PREVIEW - NO FAL / NOT APPROVED',
      ],
      panels = [];
    for (let i = 0; i < inputs.length; i++)
      panels.push({
        input: await sharp(inputs[i])
          .resize(450, 450, { fit: 'contain', background: '#171919' })
          .png()
          .toBuffer(),
        left: i * 470 + 10,
        top: 65,
      });
    const bg = Buffer.from(
      `<svg width="1410" height="545"><rect width="1410" height="545" fill="#101414"/><text x="12" y="25" font-family="Arial" font-size="21" fill="#E7BC61">${photo.tag} - ACTUAL OWNER PHOTO / PRIVATE QA / EMPLOYEE REVIEW PENDING</text>${labels.map((label, i) => `<text x="${i * 470 + 12}" y="53" font-family="Arial" font-size="16" fill="white">${label}</text>`).join('')}<text x="12" y="535" font-family="Arial" font-size="15" fill="#E7BC61">No generated provider output. Original captured pixels preserved by native codec; preview copies are lossy. No inventory or employee approval written.</text></svg>`,
    );
    fs.writeFileSync(
      path.join(m.dir, 'media', photo.tag + '-comparison.png'),
      await sharp(bg).composite(panels).png().toBuffer(),
      { flag: 'wx' },
    );
    const { base64, ...metadata } = result;
    void base64;
    results.push({ photoId: photo.photoId, tag: photo.tag, localFile: name, ...metadata });
    assert.deepEqual(
      await db.productIntakeSession.findUniqueOrThrow({ where: { id: photo.sessionId } }),
      before,
    );
    await ok(request('POST', url, { ...body, prompt: 'attack' }), 400);
    await ok(
      request('POST', url, { templateId: 'REZONA_FASHION_GHOST_MANNEQUIN_V1', templateVersion: 1 }),
      400,
    );
  }
  const out = {
    datasetId: m.id,
    totalPhotos: data.total,
    templateChecks: 340,
    readyLocalPreviews: results.filter((r) => r.label === 'LOCAL PREVIEW').length,
    blocked: results.filter((r) => r.status).length,
    results,
    employeeDecisionsWritten: 0,
    paidCalls: 0,
  };
  fs.writeFileSync(path.join(m.out, 'local-previews.json'), JSON.stringify(out, null, 2), {
    flag: 'wx',
  });
  fs.writeFileSync(path.join(m.dir, 'admin-review-response.json'), JSON.stringify(data, null, 2), {
    flag: 'wx',
  });
  console.log(
    JSON.stringify({
      photos: 17,
      localPreviews: out.readyLocalPreviews,
      blocked: out.blocked,
      compatibilityChecks: 340,
      paidCalls: 0,
    }),
  );
};
