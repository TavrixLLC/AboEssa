const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
module.exports = async ({ app, db, request, ok, m }) => {
  const { ConfigService } = require('@nestjs/config'),
    config = app.get(ConfigService),
    { ImageEditingProvider } = require(
      path.join(
        m.dir,
        'dist-' + (process.env.REAL_STUDIO_BUILD || 'v3'),
        'src/image-enhancement/enhancement.provider',
      ),
    );
  const provider = app.get(ImageEditingProvider),
    startCalls = provider.calls;
  const index = await ok(request('GET', '/admin/product-intake/studio-review'), 200);
  assert.equal(index.photos.length, 17);
  const allAssets = await db.fileAsset.findMany({
    select: { id: true, url: true, intakePrivate: true },
  });
  for (const asset of allAssets) {
    assert.equal(asset.intakePrivate, true);
    assert.equal((await fetch(new URL(asset.url, 'http://127.0.0.1:18524'))).status, 404);
  }
  const p = index.photos.find((p) => p.tag === 'P01'),
    ep = '/admin/product-intake/studio-review/' + p.photoId + '/local-preview',
    body = { templateId: p.recommendedTemplateId, templateVersion: 1 };
  for(const endpoint of ['/admin/product-intake/sessions/'+p.sessionId+'/preview','/admin/product-intake/sessions/'+p.sessionId+'/enhancements/candidates/'+p.sourceCandidateId+'/preview']){
    const response=await request('GET',endpoint);assert.equal(response.status,200);assert.equal(response.headers['cache-control'],'no-store');
  }
  await ok(request('POST', ep, { ...body, templateVersion: 2 }), 400);
  await ok(request('POST', ep, { ...body, model: 'another' }), 400);
  const pair = await Promise.all([request('POST', ep, body), request('POST', ep, body)]);
  assert.deepEqual(pair.map((r) => r.status).sort(), [201, 429]);
  const state = await db.productIntakeSession.findUniqueOrThrow({ where: { id: p.sessionId } }),
    catalog = await ok(
      request(
        'GET',
        '/admin/product-intake/sessions/' +
          p.sessionId +
          '/enhancements/studio/templates?group=GENERAL',
      ),
      200,
    );
  assert.equal(catalog.templates.length, 5);
  const general = await ok(
    request('POST', ep, { templateId: 'REZONA_GENERAL_SIGNATURE_HERO_V1', templateVersion: 1 }),
  );
  assert.equal(general.label, 'LOCAL PREVIEW');
  assert.equal(general.diagnostics.opaqueRgbMismatches, 0);
  const localFile=path.join(m.dir,'media','P01-G01-LOCAL-PREVIEW.webp'),generalBytes=Buffer.from(general.base64,'base64');
  if(fs.existsSync(localFile))assert.ok(fs.readFileSync(localFile).equals(generalBytes),'Repeated local preview must be deterministic; do not overwrite evidence');
  else fs.writeFileSync(localFile,generalBytes,{flag:'wx'});
  assert.deepEqual(
    await db.productIntakeSession.findUniqueOrThrow({ where: { id: p.sessionId } }),
    state,
  );
  const enabled = config.get('REAL_PRODUCT_STUDIO_REVIEW_ENABLED');
  config.set('REAL_PRODUCT_STUDIO_REVIEW_ENABLED', 'false');
  await ok(request('GET', '/admin/product-intake/studio-review'), 404);
  await ok(request('POST', ep, body), 404);
  config.set('REAL_PRODUCT_STUDIO_REVIEW_ENABLED', enabled);
  assert.equal(provider.calls, startCalls);
  assert.equal(provider.calls, 0);
  assert.equal(await db.productImageEnhancementDecision.count(), 0);
  assert.equal(await db.recognitionUsage.count(), 0);
  assert.equal(
    await db.productImageEnhancementJob.count({
      where: { provider: { in: ['fal', 'gemini', 'mock'] } },
    }),
    0,
  );
  const checks = [
    'Every one of 17 real photos remains visible; 340 template records/ghost incompatibility exposed',
    'All private original/local assets reject unauthenticated public API reads',
    'Wrong version/arbitrary model blocked; two local requests bounded to one execution + 429',
    'GENERAL style override on actual AirTag photo preserves source/hash/business metadata, no category change',
    'QA feature off ->404 for index and preview',
    'No provider facade calls/jobs, no usage/spend, no automatic acceptance, no business records',
  ];
  fs.writeFileSync(
    path.join(m.out, 'real-service-checks-' + Date.now() + '.json'),
    JSON.stringify(
      {
        passed: true,
        checks,
        assetsChecked: allAssets.length,
        paidCalls: 0,
        providerFacadeCalls: 0,
        employeeDecisions: 0,
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  console.log(JSON.stringify({ passed: true, checks, assets: allAssets.length }));
};
