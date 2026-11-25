// New isolated real-photo QA only. NEVER loads a provider key or seeds business records.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { randomUUID, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  m = JSON.parse(fs.readFileSync('D:/rezona-real-studio-qa/manifest.json', 'utf8')),
  mode = process.argv[2],
  v = process.env.REAL_STUDIO_BUILD || 'v1';
assert.match(v, /^v[1-9][0-9]*$/);
assert.match(m.db, /^rezona_real_studio_qa_[a-f0-9]{8}$/);
const dist = path.join(m.dir, 'dist-' + v),
  secrets = JSON.parse(fs.readFileSync(path.join(m.dir, 'runtime-secrets.json'), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex'),
  write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { flag: 'wx' });
process.env.NODE_PATH = dist + path.delimiter + path.join(root, 'node_modules');
require('node:module').Module._initPaths();
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: `postgresql://real_studio_qa:${encodeURIComponent(secrets.postgresPassword)}@127.0.0.1:55456/${m.db}`,
  REDIS_URL: 'redis://127.0.0.1:56396',
  MINIO_ENDPOINT: '127.0.0.1',
  MINIO_PORT: '59057',
  MINIO_USE_SSL: 'false',
  MINIO_ACCESS_KEY: 'real-studio-qa',
  MINIO_SECRET_KEY: secrets.minioPassword,
  MINIO_BUCKET: 'real-studio-' + m.id,
  JWT_ADMIN_ACCESS_SECRET: secrets.jwtAdmin,
  JWT_CUSTOMER_ACCESS_SECRET: secrets.jwtCustomer,
  PUSH_PROVIDER: 'disabled',
  PUBLIC_BASE_URL: 'http://127.0.0.1:18524',
  API_PREFIX: 'api',
  THROTTLE_LIMIT: '20000',
  RAPID_PRODUCT_INTAKE_ENABLED: 'true',
  INVENTORY_MANAGEMENT_ENABLED: 'true',
  IMAGE_OPTIMIZATION_ENABLED: 'true',
  IMAGE_ENHANCEMENT_ENABLED: 'true',
  IMAGE_ENHANCEMENT_LOCAL_ENABLED: 'true',
  IMAGE_LOCAL_MATTING_ENABLED: 'true',
  IMAGE_NEURAL_SEGMENTATION_ENABLED: 'true',
  IMAGE_SEGMENTATION_MODEL: 'u2net',
  IMAGE_SEGMENTATION_MODEL_DIRECTORY: 'D:/rezona-phase7-1-qa/models',
  IMAGE_SEGMENTATION_RUNTIME_DIRECTORY: 'D:/rezona-phase7-1-qa/runtime',
  IMAGE_AI_ENABLED: 'false',
  AI_RECOGNITION_ENABLED: 'false',
  AI_LIVE_CALLS_APPROVED: 'false',
  IMAGE_AI_LIVE_APPROVED: 'false',
  PRODUCT_STUDIO_ENABLED: 'false',
  PRODUCT_STUDIO_PROVIDER: 'mock',
  PRODUCT_STUDIO_LIVE_APPROVED: 'false',
  GEMINI_BRAND_STUDIO_ENABLED: 'false',
  FAL_BRAND_STUDIO_ENABLED: 'false',
  FAL_PREMIUM_3D_ENABLED: 'false',
  REAL_PRODUCT_STUDIO_REVIEW_ENABLED: 'true',
  REAL_PRODUCT_STUDIO_REVIEW_INDEX: path.join(m.dir, 'review-index.json'),
});
delete process.env.FAL_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
process.chdir(m.dir);
const origin = 'http://127.0.0.1:18524',
  fetch0 = global.fetch;
let externalAttempts = 0;
global.fetch = (url, ...rest) => {
  if (new URL(String(url)).origin !== origin) {
    externalAttempts++;
    throw Error('REAL_STUDIO_EXTERNAL_FETCH_FORBIDDEN');
  }
  return fetch0(url, ...rest);
};
require('reflect-metadata');
(async () => {
  const { NestFactory } = require('@nestjs/core'),
    { ValidationPipe } = require('@nestjs/common'),
    { AppModule } = require(path.join(dist, 'src/app.module'));
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(
    new (require(
      path.join(dist, 'src/common/filters/http-exception.filter'),
    ).HttpExceptionFilter)(),
  );
  app.useGlobalInterceptors(
    new (require(
      path.join(dist, 'src/common/interceptors/response-envelope.interceptor'),
    ).ResponseEnvelopeInterceptor)(),
  );
  await app.listen(18524, '127.0.0.1');
  let keep = false;
  try {
    const db = app.get(require(path.join(dist, 'src/prisma/prisma.service')).PrismaService),
      PasswordService = require(
        path.join(dist, 'src/common/security/password.service'),
      ).PasswordService;
    const owner =
      (await db.adminUser.findUnique({ where: { normalizedEmail: secrets.email } })) ??
      (await db.adminUser.create({
        data: {
          email: secrets.email,
          normalizedEmail: secrets.email,
          name: 'Real photo QA reviewer — private',
          role: 'OWNER',
          isOwner: true,
          passwordHash: await app.get(PasswordService).hash(secrets.password),
        },
      }));
    const login = await fetch(origin + '/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: secrets.email, password: secrets.password }),
    });
    const logged = await login.json();
    assert.ok(login.ok && logged.data?.accessToken);
    const request = async (method, url, body, jwt = logged.data.accessToken) => {
      const multipart = body instanceof FormData,
        r = await fetch(origin + '/api' + url, {
          method,
          headers: {
            ...(!multipart ? { 'content-type': 'application/json' } : {}),
            ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
          },
          body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
        });
      const b = await r.json();
      return { status: r.status, data: b.data, body: b, headers: Object.fromEntries(r.headers) };
    };
    const ok = async (p, expected = 201) => {
      const r = await p;
      assert.equal(
        r.status,
        expected,
        JSON.stringify({ status: r.status, code: r.body?.code, error: r.body?.error }),
      );
      return r.data;
    };
    const base = '/admin/product-intake/sessions',
      ep = (s) => base + '/' + s.id + '/enhancements';
    const status = (s) => ok(request('GET', ep(s)), 200);
    async function wait(s, id) {
      const until = Date.now() + 120000;
      while (Date.now() < until) {
        const st = await status(s),
          j = st.jobs.find((j) => j.id === id);
        if (j && ['COMPLETED', 'FAILED', 'UNKNOWN', 'CANCELLED'].includes(j.status)) return j;
        await new Promise((r) => setTimeout(r, 250));
      }
      throw Error('LOCAL_JOB_TIMEOUT');
    }
    async function runJob(p, s, jobMode, key, extra = {}) {
      await ok(
        request('POST', ep(s), {
          clientImageId: p.imageId,
          requestKey: key,
          mode: jobMode,
          ...extra,
        }),
      );
      const req = await db.productImageEnhancementRequest.findUniqueOrThrow({
        where: { sessionId_requestKey: { sessionId: s.id, requestKey: key } },
      });
      const job = await wait(s, req.jobId);
      if (job.candidate) {
        for (const kind of ['candidate', ...(job.candidate.maskAvailable ? ['mask'] : [])]) {
          const preview = await ok(
            request(
              'GET',
              ep(s) + '/candidates/' + job.candidate.id + '/preview?edge=1024&kind=' + kind,
            ),
            200,
          );
          const file = path.join(
            m.dir,
            'media',
            p.tag +
              '-' +
              (extra.foregroundRegion ? 'guided' : jobMode === 'CLEAN' ? 'clean' : 'auto') +
              '-' +
              kind +
              '.webp',
          );
          if (!fs.existsSync(file))
            fs.writeFileSync(file, Buffer.from(preview.base64, 'base64'), { flag: 'wx' });
        }
      }
      return job;
    }
    if (mode === 'automatic') {
      const results = [];
      for (const p of m.photos) {
        if (p.status !== 'ADMITTED_SOURCE' || p.duplicateOf) {
          results.push({ photoId: p.photoId, status: p.status, duplicateOf: p.duplicateOf });
          continue;
        }
        const dest = path.join(m.dir, 'admit-' + p.tag + '.json');
        if (fs.existsSync(dest)) {
          results.push(JSON.parse(fs.readFileSync(dest, 'utf8')));
          continue;
        }
        const bytes = fs.readFileSync(p.original);
        assert.equal(sha(bytes), p.sha256);
        let s = await ok(
          request('POST', base, {
            clientDraftId: p.clientDraftId,
            submissionOperationKey: 'real-studio-' + m.id + '-' + p.tag,
          }),
        );
        if (!s.selectedImageKey)
          s = await ok(
            request('PATCH', base + '/' + s.id, {
              expectedRevision: s.revision,
              selectedImageKey: p.imageId,
              approvedMetadata: {
                title: p.tag + ' — ' + p.label,
                description: 'مسودة تقييم صور خاصة، لا تسجيل مخزون أو تأكيد محتوى العبوة.',
              },
            }),
            200,
          );
        const form = new FormData();
        form.set('clientImageId', p.imageId);
        form.set(
          'file',
          new Blob([bytes], { type: 'image/' + (p.format === 'jpeg' ? 'jpeg' : p.format) }),
          p.filename,
        );
        s = await ok(request('POST', base + '/' + s.id + '/image', form));
        const before = await db.productIntakeSession.findUniqueOrThrow({ where: { id: s.id } });
        assert.equal(before.quantity, null);
        assert.equal(before.locationId, null);
        assert.equal(before.completedProductId, null);
        const source = await db.productIntakeImage.findFirstOrThrow({
          where: { sessionId: s.id },
          include: { asset: true },
        });
        assert.equal(
          source.requestHash,
          sha(Buffer.concat([Buffer.from('image/' + p.format), bytes])),
        );
        assert.equal((await fetch(new URL(source.asset.url, origin))).status, 404);
        const original = await ok(request('GET', base + '/' + s.id + '/preview'), 200);
        fs.writeFileSync(
          path.join(m.dir, 'media', p.tag + '-original-preview.webp'),
          Buffer.from(original.dataBase64, 'base64'),
          { flag: 'wx' },
        );
        const automatic = await runJob(p, s, 'NEURAL_BACKGROUND_REMOVE', p.autoKey),
          clean = await runJob(p, s, 'CLEAN', p.cleanKey);
        const row = {
          photoId: p.photoId,
          tag: p.tag,
          sessionId: s.id,
          clientImageId: p.imageId,
          originalSha256: p.sha256,
          sourceHash: source.requestHash,
          sourceAssetId: source.asset.id,
          automatic,
          clean,
          employeeApproval: 'PENDING_NOT_AUTO_ACCEPTED',
          providerStatus: 'REAL_FAL_NOT_AUTHORIZED',
        };
        write(dest, row);
        results.push(row);
        console.log(
          JSON.stringify({
            tag: p.tag,
            label: p.label,
            automatic: automatic.status,
            warnings: automatic.candidate?.warnings ?? [],
            error: automatic.errorCode,
          }),
        );
      }
      write(path.join(m.out, 'automatic-' + Date.now() + '.json'), {
        results,
        paidCalls: 0,
        externalAttempts,
      });
    } else if (mode === 'guided') {
      const plans = JSON.parse(fs.readFileSync(path.join(m.dir, 'guided-plan.json'), 'utf8')),
        results = [];
      for (const plan of plans) {
        const p = m.photos.find((p) => p.photoId === plan.photoId),
          s = {
            id: JSON.parse(fs.readFileSync(path.join(m.dir, 'admit-' + p.tag + '.json'), 'utf8'))
              .sessionId,
          };
        const job = await runJob(p, s, 'NEURAL_BACKGROUND_REMOVE', p.guidedKey, {
          foregroundRegion: plan.region,
        });
        const row = {
          photoId: p.photoId,
          tag: p.tag,
          region: plan.region,
          method: 'VISUAL_QA_RECTANGLE_GUIDANCE_REAL_ONNX_NOT_A_MANUAL_MASK',
          job,
          employeeApproval: 'PENDING',
        };
        const dest = path.join(m.dir, 'guided-' + p.tag + '.json');
        if (!fs.existsSync(dest)) write(dest, row);
        results.push(row);
        console.log(
          JSON.stringify({
            tag: p.tag,
            guided: job.status,
            warnings: job.candidate?.warnings ?? [],
          }),
        );
      }
      write(path.join(m.out, 'guided-' + Date.now() + '.json'), { results, paidCalls: 0 });
    } else if (mode === 'serve') {
      keep = true;
      console.log(
        JSON.stringify({
          serving: true,
          origin,
          review: 'Existing admin QA review API',
          paidEnabled: false,
        }),
      );
      await new Promise(() => {});
    } else if (['preview', 'checks', 'export'].includes(mode)) {
      await require('./real-studio-' + mode + '.cjs')({ app, db, owner, request, ok, m, origin });
    } else throw Error('UNKNOWN_REAL_QA_MODE');
    assert.equal(externalAttempts, 0);
    const counts = {};
    for (const table of [
      'productListing',
      'warehouse',
      'warehouseLocation',
      'inventoryMovement',
      'customerWallet',
      'customer',
      'order',
      'auction',
    ]) {
      counts[table] = await db[table].count();
      assert.equal(counts[table], 0, 'No business records: ' + table);
    }
    assert.equal(
      await db.productImageEnhancementDecision.count(),
      0,
      'No automated employee acceptance',
    );
    assert.equal(await db.recognitionUsage.count(), 0, 'No provider usage ledger');
    write(path.join(m.out, mode + '-business-safety-' + Date.now() + '.json'), {
      counts,
      decisions: 0,
      usage: 0,
      externalAttempts,
      paidCalls: 0,
      originalsUnchanged: m.photos.every(
        (p) => !p.sha256 || sha(fs.readFileSync(p.path)) === p.sha256,
      ),
    });
  } finally {
    if (!keep) await app.close();
  }
})().catch((e) => {
  write(path.join(m.out, 'failed-' + mode + '-' + Date.now() + '.json'), {
    error: e.message,
    paidCalls: 0,
  });
  console.error(e.stack?.replaceAll(secrets.postgresPassword, '[REDACTED]') ?? e.message);
  process.exit(1);
});
