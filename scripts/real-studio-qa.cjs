// Owner-authorized photo folder + six already-authorized historical originals only.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  sharp = require('sharp'),
  { spawnSync } = require('node:child_process'),
  { createHash, randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  base = 'D:/rezona-real-studio-qa',
  mp = path.join(base, 'manifest.json'),
  mode = process.argv[2],
  sha = (b) => createHash('sha256').update(b).digest('hex');
const write = (file, data) =>
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2), {
    flag: 'wx',
  });
const files = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
function run(exe, args, env = {}) {
  const e = { ...process.env, ...env };
  delete e.FAL_KEY;
  delete e.GEMINI_API_KEY;
  delete e.GOOGLE_API_KEY;
  const r = spawnSync(exe, args, {
    cwd: root,
    env: e,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 300000,
    maxBuffer: 48 * 1024 * 1024,
  });
  return { ...r, log: (r.stdout ?? '') + '\n' + (r.stderr ?? '') };
}
const labels = {
  '18.01.32.jpeg': [
    'عبوة حامل شحن لاسلكي T6',
    'ELECTRONICS',
    'BOX',
    'REZONA_ELECTRONICS_GOLD_PEDESTAL_V1',
  ],
  '18.01.32 (1).jpeg': [
    'عبوة تحمل AirTag — 4 pack',
    'ELECTRONICS',
    'BOX',
    'REZONA_ELECTRONICS_GOLD_PEDESTAL_V1',
  ],
  '18.01.32 (2).jpeg': ['عبوة جهاز تجميل للرقبة', 'HOME', 'BOX', 'REZONA_HOME_BATHROOM_VANITY_V1'],
  '18.01.32 (3).jpeg': [
    'عبوة جهاز HeadaTerm',
    'ELECTRONICS',
    'BOX',
    'REZONA_ELECTRONICS_GOLD_PEDESTAL_V1',
  ],
  '18.01.33 (1).jpeg': [
    'عبوة جهاز طهي بالبخار George home',
    'HOME',
    'BOX',
    'REZONA_HOME_BLACK_MARBLE_KITCHEN_V1',
  ],
  '18.01.33.jpeg': [
    'حقيبة سفر صلبة داكنة',
    'FASHION',
    'ACCESSORY',
    'REZONA_FASHION_GOLD_RING_TABLE_V1',
  ],
  '18.02.48.jpeg': ['عبوة مناديل مبللة SUNKISS', 'HOME', 'BOX', 'REZONA_HOME_BATHROOM_VANITY_V1'],
  '18.08.15.jpeg': [
    'حلقة إضاءة مع حوامل وكابل وعبوة',
    'ELECTRONICS',
    'DEVICE',
    'REZONA_ELECTRONICS_GOLD_PEDESTAL_V1',
  ],
  '18.17.04.jpeg': [
    'طقم قفل ذكي ومفاتيح وملحقات ظاهرة',
    'ELECTRONICS',
    'DEVICE',
    'REZONA_ELECTRONICS_GOLD_PEDESTAL_V1',
  ],
  '18.19.19.jpeg': [
    'كنزة محبوكة زرقاء فاتحة مفرودة',
    'FASHION',
    'FLAT_GARMENT',
    'REZONA_FASHION_MARBLE_EDITORIAL_V1',
  ],
  '18.34.42.jpeg': [
    'أغطية عجلات ظاهرة مع تغليف بلاستيكي',
    'GENERAL',
    'OTHER',
    'REZONA_GENERAL_SIGNATURE_HERO_V1',
  ],
};
(async () => {
  if (mode === 'init') {
    assert.ok(!fs.existsSync(mp), 'No overwrite: existing evaluation manifest');
    fs.mkdirSync(base, { recursive: true });
    const id = randomUUID().slice(0, 8),
      dir = path.join(base, 'run-' + id),
      out = path.join(root, 'docs/benchmarks/real-product-studio', id);
    fs.mkdirSync(dir);
    fs.mkdirSync(out, { recursive: true });
    fs.mkdirSync(path.join(dir, 'originals'));
    fs.mkdirSync(path.join(dir, 'media'));
    const previous = JSON.parse(
      fs.readFileSync('D:/rezona-phase7-1-qa/real-products-20261121/intake-journal.json', 'utf8'),
    );
    const folder = 'C:/Users/3ma/Downloads/منتجات',
      inventory = fs
        .readdirSync(folder, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => ({ file: path.join(folder, e.name), newOwnerSource: true }));
    const historical = previous.products.map((p) => ({
      file: p.originalCopy,
      newOwnerSource: false,
      historical: p,
    }));
    const photos = [],
      seen = new Map();
    let number = 0;
    for (const source of [...inventory, ...historical]) {
      number++;
      const tag = 'P' + String(number).padStart(2, '0'),
        filename = source.historical
          ? path.basename(source.historical.originalPath)
          : path.basename(source.file);
      const common = {
        tag,
        filename,
        path: source.file,
        newOwnerSource: source.newOwnerSource,
        existingQaProductId: source.historical?.productId ?? null,
        clientDraftId: randomUUID(),
        imageId: randomUUID(),
        autoKey: randomUUID(),
        guidedKey: randomUUID(),
        cleanKey: randomUUID(),
      };
      if (!fs.existsSync(source.file)) {
        photos.push({ ...common, photoId: 'MISSING-' + tag, status: 'MISSING_SOURCE' });
        continue;
      }
      const bytes = fs.readFileSync(source.file),
        hash = sha(bytes);
      let meta;
      try {
        meta = await sharp(bytes, { limitInputPixels: 12000000, failOn: 'warning' }).metadata();
      } catch (e) {
        photos.push({
          ...common,
          photoId: 'INVALID-' + hash.slice(0, 12),
          sha256: hash,
          status: 'INVALID_IMAGE',
          reason: e.message,
        });
        continue;
      }
      const match = source.historical
        ? null
        : Object.keys(labels).find((k) => filename.endsWith('at ' + k));
      const data = source.historical
        ? [
            source.historical.title,
            source.historical.n <= 3 ? 'ELECTRONICS' : 'HOME',
            source.historical.n === 6 ? 'HOME_OBJECT' : 'BOX',
            source.historical.n <= 3
              ? 'REZONA_ELECTRONICS_GOLD_PEDESTAL_V1'
              : 'REZONA_HOME_BLACK_MARBLE_KITCHEN_V1',
          ]
        : (labels[match] ?? [
            'صورة QA غير مصنفة',
            'GENERAL',
            'OTHER',
            'REZONA_GENERAL_SIGNATURE_HERO_V1',
          ]);
      const original = path.join(
        dir,
        'originals',
        tag + '.' + (meta.format === 'jpeg' ? 'jpeg' : meta.format),
      );
      fs.copyFileSync(source.file, original, fs.constants.COPYFILE_EXCL);
      assert.equal(sha(fs.readFileSync(original)), hash);
      const duplicateOf = seen.get(hash) ?? null;
      if (!duplicateOf) seen.set(hash, tag);
      photos.push({
        ...common,
        photoId: 'RP-' + hash.slice(0, 16),
        sha256: hash,
        original,
        bytes: bytes.length,
        format: meta.format,
        width: meta.width,
        height: meta.height,
        orientation: meta.orientation ?? 1,
        pages: meta.pages ?? 1,
        duplicateOf,
        label: data[0],
        suggestedGroup: data[1],
        sourceKind: data[2],
        recommendedTemplateId: data[3],
        templateVersion: 1,
        placement: { camera: 'TOP_DOWN', quarterTurns: 0, horizontal: 0.5 },
        historicalGuidedRegion: source.historical?.foregroundRegion ?? null,
        status: 'ADMITTED_SOURCE',
        metadataMethod: 'MANUAL_VISIBLE_INFORMATION_NOT_AI_RECOGNITION',
      });
    }
    const protectedFiles = [
      ...files(path.join(root, 'docs/benchmarks')).filter(
        (f) => !f.includes(path.join('benchmarks', 'real-product-studio')),
      ),
      ...files(path.join(root, 'docs')).filter(
        (f) => /rezona-.*\.md$/.test(f) && !f.includes('benchmarks'),
      ),
      ...['inventory', 'sales', 'auctions', 'shipping', 'wallet', 'orders', 'checkout'].flatMap(
        (d) => files(path.join(root, 'src', d)),
      ),
      path.join(root, 'src/product-intake/product-intake.service.ts'),
      ...previous.products.map((p) => p.originalCopy),
    ];
    const baseline = [...new Set(protectedFiles)].map((file) => ({
      file,
      sha256: sha(fs.readFileSync(file)),
    }));
    const m = {
      id,
      dir,
      out,
      db: 'rezona_real_studio_qa_' + id,
      regressionDb: 'rezona_real_studio_reg_' + id,
      createdAt: new Date().toISOString(),
      timezone: 'Asia/Baghdad',
      photoFolder: folder,
      photos,
      baseline,
      ports: { pg: 55456, redis: 56396, minio: 59057, console: 59058, api: 18524 },
      paidAuthorization: false,
      production: 'NO_GO',
    };
    write(mp, m);
    write(path.join(out, 'source-inventory.json'), {
      id,
      photos,
      distinctPhotos: seen.size,
      missing: photos.filter((p) => p.status !== 'ADMITTED_SOURCE'),
    });
    write(path.join(out, 'protected-baseline.json'), baseline);
    for (const repo of ['AboEssa', 'AboEssaMobile']) {
      const r = spawnSync('git', ['status', '--short'], {
        cwd: path.resolve(root, '..', repo),
        encoding: 'utf8',
        windowsHide: true,
      });
      write(path.join(dir, repo + '-initial-worktree.txt'), r.stdout ?? '');
    }
    console.log(
      JSON.stringify({
        id,
        photos: photos.length,
        distinct: seen.size,
        newPhotos: inventory.length,
        historical: historical.length,
        dir,
        out,
      }),
    );
    return;
  }
  const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
  assert.match(m.id, /^[a-f0-9]{8}$/);
  if (mode === 'services') {
    const names = ['postgres', 'redis', 'minio'].map(
        (n) => 'rezona-real-studio-qa-' + m.id + '-' + n,
      ),
      old = run('docker', ['ps', '-a', '--format', '{{.Names}}']);
    assert.equal(old.status, 0);
    assert.ok(names.every((n) => !old.log.split(/\r?\n/).includes(n)));
    const secrets = {
      postgresPassword: randomUUID() + randomUUID(),
      minioPassword: randomUUID() + randomUUID(),
      email: 'real-studio-' + m.id + '@example.test',
      password: randomUUID() + ':Aa9!',
      jwtAdmin: randomUUID() + randomUUID(),
      jwtCustomer: randomUUID() + randomUUID(),
    };
    write(path.join(m.dir, 'runtime-secrets.json'), secrets);
    const setups = [
      [
        '-e',
        'POSTGRES_USER=real_studio_qa',
        '-e',
        'POSTGRES_PASSWORD=' + secrets.postgresPassword,
        '-e',
        'POSTGRES_DB=' + m.db,
        '-p',
        '127.0.0.1:55456:5432',
        'postgres:16-alpine',
      ],
      ['-p', '127.0.0.1:56396:6379', 'redis:7-alpine'],
      [
        '-e',
        'MINIO_ROOT_USER=real-studio-qa',
        '-e',
        'MINIO_ROOT_PASSWORD=' + secrets.minioPassword,
        '-p',
        '127.0.0.1:59057:9000',
        '-p',
        '127.0.0.1:59058:9001',
        'minio/minio:RELEASE.2025-09-07T16-13-09Z',
        'server',
        '/data',
        '--console-address',
        ':9001',
      ],
    ];
    setups.forEach((args, i) =>
      assert.equal(run('docker', ['run', '-d', '--name', names[i], ...args]).status, 0),
    );
    write(path.join(m.out, 'new-services.json'), {
      names,
      ports: m.ports,
      oldContainersTouched: false,
    });
    console.log('Fresh isolated services created');
    return;
  }
  if (mode === 'migrate') {
    const secrets = JSON.parse(fs.readFileSync(path.join(m.dir, 'runtime-secrets.json'), 'utf8'));
    assert.equal(
      run('docker', [
        'exec',
        'rezona-real-studio-qa-' + m.id + '-postgres',
        'createdb',
        '-U',
        'real_studio_qa',
        m.regressionDb,
      ]).status,
      0,
    );
    for (const db of [m.db, m.regressionDb]) {
      const r = run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
        DATABASE_URL: `postgresql://real_studio_qa:${encodeURIComponent(secrets.postgresPassword)}@127.0.0.1:55456/${db}`,
      });
      write(
        path.join(m.out, 'migration-' + db + '.log'),
        r.log.replaceAll(secrets.postgresPassword, '[REDACTED]'),
      );
      assert.equal(r.status, 0);
    }
    console.log('Fresh photo QA and separate regression migrations passed');
    return;
  }
  if (mode === 'build') {
    const v = process.argv[3];
    assert.match(v, /^v[1-9][0-9]*$/);
    const dist = path.join(m.dir, 'dist-' + v);
    assert.ok(!fs.existsSync(dist));
    const r = run(process.execPath, [
      'node_modules/typescript/bin/tsc',
      '--project',
      'tsconfig.build.json',
      '--outDir',
      dist,
      '--incremental',
      'false',
    ]);
    write(path.join(m.out, 'build-' + v + '.log'), r.log);
    assert.equal(r.status, 0);
    console.log(JSON.stringify({ dist, passed: true }));
    return;
  }
  if (mode === 'baseline') {
    for (const b of m.baseline) assert.equal(sha(fs.readFileSync(b.file)), b.sha256, b.file);
    for (const p of m.photos.filter((p) => p.sha256)) {
      assert.equal(sha(fs.readFileSync(p.path)), p.sha256);
      assert.equal(sha(fs.readFileSync(p.original)), p.sha256);
    }
    console.log(JSON.stringify({ protectedFiles: m.baseline.length, originalsUnchanged: true }));
    return;
  }
  throw Error('UNKNOWN_MODE');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
