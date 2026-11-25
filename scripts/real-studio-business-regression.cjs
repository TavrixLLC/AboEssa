// Synthetic regression fixtures ONLY in a separate disposable database, never the photo dataset.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  m = JSON.parse(fs.readFileSync('D:/rezona-real-studio-qa/manifest.json', 'utf8')),
  secrets = JSON.parse(fs.readFileSync(path.join(m.dir, 'runtime-secrets.json'), 'utf8')),
  v = process.env.REAL_STUDIO_BUILD || 'v3',
  dist = path.join(m.dir, 'dist-' + v),
  mode = process.argv[2];
assert.match(v, /^v[1-9][0-9]*$/);
assert.match(m.regressionDb, /^rezona_real_studio_reg_[a-f0-9]{8}$/);
assert.ok(['commerce', 'intake','studio'].includes(mode));
const Module = require('node:module'),
  resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  if (request.startsWith('../dist/')) request = path.join(dist, request.slice(8));
  return resolve.call(this, request, parent, ...args);
};
process.env.NODE_PATH = dist + path.delimiter + path.join(root, 'node_modules');
Module._initPaths();
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: `postgresql://real_studio_qa:${encodeURIComponent(secrets.postgresPassword)}@127.0.0.1:55456/${m.regressionDb}`,
  REDIS_URL: 'redis://127.0.0.1:56396/1',
  MINIO_ENDPOINT: '127.0.0.1',
  MINIO_PORT: '59057',
  MINIO_USE_SSL: 'false',
  MINIO_ACCESS_KEY: 'real-studio-qa',
  MINIO_SECRET_KEY: secrets.minioPassword,
  MINIO_BUCKET: 'real-studio-reg-' + m.id,
  JWT_ADMIN_ACCESS_SECRET: secrets.jwtAdmin,
  JWT_CUSTOMER_ACCESS_SECRET: secrets.jwtCustomer,
  PUSH_PROVIDER: 'disabled',
  API_PREFIX: 'api',
  PUBLIC_BASE_URL: 'http://127.0.0.1:18526',
  THROTTLE_LIMIT: '20000',
  IMAGE_OPTIMIZATION_ENABLED: 'true',
  INVENTORY_MANAGEMENT_ENABLED: 'true',
  RAPID_PRODUCT_INTAKE_ENABLED: 'true',
  IMAGE_ENHANCEMENT_ENABLED: 'false',
  AI_RECOGNITION_ENABLED: 'false',
  AI_LIVE_CALLS_APPROVED: 'false',
  IMAGE_AI_LIVE_APPROVED: 'false',
  PRODUCT_STUDIO_ENABLED: 'false',
  REAL_PRODUCT_STUDIO_REVIEW_ENABLED: 'false',
});
if(mode==='studio')Object.assign(process.env,{IMAGE_ENHANCEMENT_ENABLED:'true',IMAGE_ENHANCEMENT_LOCAL_ENABLED:'true',IMAGE_LOCAL_MATTING_ENABLED:'true',IMAGE_NEURAL_SEGMENTATION_ENABLED:'true',IMAGE_SEGMENTATION_MODEL:'u2net',IMAGE_SEGMENTATION_MODEL_DIRECTORY:'D:/rezona-phase7-1-qa/models',IMAGE_SEGMENTATION_RUNTIME_DIRECTORY:'D:/rezona-phase7-1-qa/runtime',PRODUCT_STUDIO_ENABLED:'true',PRODUCT_STUDIO_PROVIDER:'mock',PRODUCT_STUDIO_MOCK_APPROVED:'true',PRODUCT_STUDIO_LIVE_APPROVED:'false',IMAGE_AI_DAILY_LIMIT:'1000',IMAGE_AI_EMPLOYEE_DAILY_LIMIT:'100',IMAGE_AI_EMPLOYEE_HOURLY_LIMIT:'30'});
delete process.env.FAL_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
process.chdir(m.dir);
const origin = 'http://127.0.0.1:18526',
  fetch0 = global.fetch;
global.fetch = (url, ...rest) => {
  if (new URL(String(url)).origin !== origin)
    throw Error('REAL_STUDIO_REG_EXTERNAL_FETCH_FORBIDDEN');
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
  await app.listen(18526, '127.0.0.1');
  try {
    const db = app.get(require(path.join(dist, 'src/prisma/prisma.service')).PrismaService),
      email = 'reg-' + randomUUID() + '@example.test',
      password = randomUUID() + ':Aa9!';
    const owner = await db.adminUser.create({
      data: {
        email,
        normalizedEmail: email,
        name: 'Synthetic regression only',
        role: 'OWNER',
        isOwner: true,
        passwordHash: await app
          .get(require(path.join(dist, 'src/common/security/password.service')).PasswordService)
          .hash(password),
      },
    });
    const login = await fetch(origin + '/api/admin/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
      logged = await login.json();
    assert.ok(login.ok && logged.data?.accessToken);
    let token = logged.data.accessToken;
    const request = async (method, url, body, jwt = token, key) => {
      const multi = body instanceof FormData,
        r = await fetch(origin + '/api' + url, {
          method,
          headers: {
            ...(!multi ? { 'content-type': 'application/json' } : {}),
            ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
            ...(key ? { 'Idempotency-Key': key } : {}),
          },
          body: body === undefined ? undefined : multi ? body : JSON.stringify(body),
        }),
        b = await r.json();
      return { status: r.status, data: b.data, body: b, headers: Object.fromEntries(r.headers) };
    };
    const category = await db.category.create({
        data: { name: mode==='studio'?'الإلكترونيات':'Synthetic regression', slug: 'real-reg-' + randomUUID() },
      }),
      customer = await db.customer.create({
        data: {
          displayName: 'Synthetic only',
          phone: '+1559' + Date.now(),
          wallet: { create: { availableBalance: 200000 } },
        },
      }),
      customerToken = await app
        .get(require(path.join(dist, 'src/auth/token.service')).TokenService)
        .signCustomerAccess(customer),
      checks = [];
    const context={
      app,
      db,
      request,
      owner,
      admin: owner,
      ownerToken: token,
      customer,
      customerToken,
      category,
      checks,
      origin,
      out:m.out,qa:m.dir,runId:m.id,
      delivery: {
        fullName: 'QA',
        phone: '+15550100000',
        governorate: 'QA',
        city: 'QA',
        addressLine: 'Synthetic only',
      },
    };
    context.switchEmployee=async()=>{
      const mail='reg-second-'+randomUUID()+'@example.test',pass=randomUUID()+':Aa9!',actor=await db.adminUser.create({data:{email:mail,normalizedEmail:mail,name:'Second synthetic studio reviewer',role:'OWNER',isOwner:true,passwordHash:await app.get(require(path.join(dist,'src/common/security/password.service')).PasswordService).hash(pass)}});
      const r=await fetch(origin+'/api/admin/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:mail,password:pass})}),j=await r.json();assert.ok(r.ok&&j.data?.accessToken);token=j.data.accessToken;context.owner=actor;context.admin=actor;
    };
    await require(mode==='commerce'?'./phase4-inventory-checks.cjs':mode==='studio'?'./studio20-checks.cjs':'./phase5-intake-checks.cjs')(context);
    fs.writeFileSync(
      path.join(m.out, 'regression-' + mode + '-' + Date.now() + '.json'),
      JSON.stringify(
        {
          passed: true,
          database: m.regressionDb,
          realPhotoDatasetTouched: false,
          checks,
          paidCalls: 0,
        },
        null,
        2,
      ),
      { flag: 'wx' },
    );
    console.log(
      JSON.stringify({ passed: true, mode, checks: checks.length, scope: m.regressionDb }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  fs.writeFileSync(path.join(m.out,'failed-regression-'+mode+'-'+Date.now()+'.json'),JSON.stringify({passed:false,error:e.message,scope:m.regressionDb,paidCalls:0}),{flag:'wx'});
  console.error(e.message);
  process.exit(1);
});
