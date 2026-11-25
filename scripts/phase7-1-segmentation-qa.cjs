// Own isolated Phase 7 services only. Never accepts an external DB/API URL or loads repository dotenv.
if (process.env.REZONA_PHASE71_QA !== '1')
  throw Error('Explicit isolated Phase 7 QA opt-in required');
const path = require('node:path'),
  fs = require('node:fs/promises'),
  { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  qa = 'D:/rezona-phase7-1-qa';
require('node:fs').mkdirSync(qa, { recursive: true });
if (require('node:fs').existsSync(path.join(qa, '.env'))) throw Error('Unexpected QA dotenv');
process.chdir(qa);
const mode = process.argv[2] ?? 'checks';
if (!['checks', 'intake-regressions', 'commerce-regressions', 'serve'].includes(mode))
  throw Error('Invalid mode');
const origin = 'http://127.0.0.1:' + (mode === 'serve' ? 18493 : 18495);
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://phase71_qa:phase71-local-only@127.0.0.1:55452/rezona_phase71_qa',
  REDIS_URL: 'redis://127.0.0.1:56392',
  MINIO_ENDPOINT: '127.0.0.1',
  MINIO_PORT: '59052',
  MINIO_USE_SSL: 'false',
  MINIO_ACCESS_KEY: 'phase71-qa',
  MINIO_SECRET_KEY: 'phase71-local-only',
  MINIO_BUCKET: 'phase71-qa',
  JWT_ADMIN_ACCESS_SECRET: randomUUID() + randomUUID(),
  JWT_CUSTOMER_ACCESS_SECRET: randomUUID() + randomUUID(),
  PUSH_PROVIDER: 'disabled',
  IMAGE_OPTIMIZATION_ENABLED: 'true',
  PUBLIC_BASE_URL: origin,
  API_PREFIX: 'api',
  INVENTORY_MANAGEMENT_ENABLED: 'true',
  RAPID_PRODUCT_INTAKE_ENABLED: 'true',
  THROTTLE_LIMIT: '20000',
  AI_RECOGNITION_ENABLED: ['intake-regressions', 'commerce-regressions'].includes(mode)
    ? 'false'
    : 'true',
  AI_RECOGNITION_PROVIDER: 'mock',
  IMAGE_ENHANCEMENT_ENABLED: 'true',
  IMAGE_ENHANCEMENT_LOCAL_ENABLED: 'true',
  IMAGE_LOCAL_MATTING_ENABLED: 'true',
  IMAGE_NEURAL_SEGMENTATION_ENABLED: 'true',
  IMAGE_SEGMENTATION_MODEL: 'u2net',
  IMAGE_SEGMENTATION_MODEL_DIRECTORY: 'D:/rezona-phase7-1-qa/models',
  IMAGE_SEGMENTATION_RUNTIME_DIRECTORY: 'D:/rezona-phase7-1-qa/runtime',
  IMAGE_AI_ENABLED: 'true',
  IMAGE_AI_PROVIDER: 'mock',
  IMAGE_AI_LIVE_APPROVED: 'false',
  IMAGE_AI_DAILY_LIMIT: '1000',
  IMAGE_AI_EMPLOYEE_DAILY_LIMIT: '100',
  IMAGE_AI_EMPLOYEE_HOURLY_LIMIT: '30',
  AI_LIVE_CALLS_APPROVED: 'false',
  AI_MONTHLY_BUDGET_USD: '0',
  AI_DAILY_BUDGET_USD: '0',
  AI_DAILY_REQUEST_LIMIT: '1000',
  AI_EMPLOYEE_DAILY_LIMIT: '1000',
  AI_MODEL_DAILY_LIMIT: '1000',
  AI_EMPLOYEE_HOURLY_LIMIT: '100',
});
require('reflect-metadata');
process.env.NODE_PATH = path.join(root, 'dist');
require('node:module').Module._initPaths();
const { NestFactory } = require('@nestjs/core'),
  { ValidationPipe } = require('@nestjs/common');
const { AppModule } = require('../dist/src/app.module'),
  { PrismaService } = require('../dist/src/prisma/prisma.service');
const { TokenService } = require('../dist/src/auth/token.service'),
  { PasswordService } = require('../dist/src/common/security/password.service');
const { HttpExceptionFilter } = require('../dist/src/common/filters/http-exception.filter');
const {
  ResponseEnvelopeInterceptor,
} = require('../dist/src/common/interceptors/response-envelope.interceptor');
(async () => {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  await app.listen(new URL(origin).port, '127.0.0.1');
  const db = app.get(PrismaService),
    tokens = app.get(TokenService),
    checks = [];
  const email = 'phase7-device-qa@example.test',
    password = 'QaPhase7LocalOnly2026!';
  const owner = await db.adminUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      normalizedEmail: email,
      name: 'PHASE7 QA OWNER',
      role: 'OWNER',
      isOwner: true,
      passwordHash: await app.get(PasswordService).hash(password),
    },
  });
  const customer = await db.customer.create({
    data: {
      displayName: 'PHASE7 QA BUYER',
      phone: '+1559' + Date.now(),
      wallet: { create: { availableBalance: 200000 } },
    },
  });
  const ownerToken = await tokens.signAdminAccess(owner),
    customerToken = await tokens.signCustomerAccess(customer);
  const request = async (method, url, body, token = ownerToken, key) => {
    const multipart = body instanceof FormData;
    const r = await fetch(origin + '/api' + url, {
      method,
      headers: {
        ...(!multipart ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    });
    const value = await r.json();
    return {
      status: r.status,
      data: value.data,
      body: value,
      headers: Object.fromEntries(r.headers),
    };
  };
  try {
    const category = await db.category.create({
      data: { name: 'العناية Phase7 QA', slug: 'phase7-' + randomUUID() },
    });
    const delivery = {
      fullName: 'QA only',
      phone: '+15550100000',
      governorate: 'QA',
      city: 'QA',
      addressLine: 'Disposable QA address',
    };
    const context = {
      app,
      db,
      request,
      owner,
      admin: owner,
      ownerToken,
      customer,
      customerToken,
      category,
      delivery,
      checks,
      origin,
    };
    if (mode === 'serve') {
      app.get(
        require('../dist/src/ai/recognition.provider').MockRecognitionProvider,
      ).defaultFixture = {
        name_ar: 'منتج محاكاة QA 400 مل',
        name_en: null,
        description_ar: 'اقتراح تجريبي لا يدّعي التعرّف على الصورة',
        brand: null,
        product_type: null,
        category_id: category.id,
        size_value: null,
        size_unit: null,
        color: null,
        model_number: null,
        manufacturer: null,
        barcode_text: null,
        visible_attributes: [],
        uncertain_fields: ['name_ar'],
        needs_review: true,
      };
      const warehouse = await db.warehouse.create({
        data: {
          code: ('P6-DEVICE-' + randomUUID().slice(0, 6)).toUpperCase(),
          name: 'Phase7 device QA',
        },
      });
      await db.warehouseLocation.createMany({
        data: [
          { warehouseId: warehouse.id, code: 'A-01', name: 'Phase7 QA A01' },
          { warehouseId: warehouse.id, code: 'B-02', name: 'Phase7 QA B02' },
        ],
      });
      await fs.writeFile(
        path.join(qa, 'device-defines.json'),
        JSON.stringify({
          API_BASE_URL: origin,
          SOCKET_URL: origin,
          APP_ENV: 'local',
          INVENTORY_MANAGEMENT_ENABLED: 'true',
          RAPID_PRODUCT_INTAKE_ENABLED: 'true',
          AI_RECOGNITION_ENABLED: 'true',
          PHASE5_QA_EMAIL: email,
          PHASE5_QA_PASSWORD: password,
        }),
      );
      console.log('Phase 7 isolated MOCK server ready on 58493. No paid requests.');
      process.once('SIGINT', async () => {
        await app.close();
        process.exit(0);
      });
      await new Promise(() => {});
    } else {
      await require(
        mode === 'checks'
          ? './phase7-1-segmentation-checks.cjs'
          : mode === 'intake-regressions'
            ? './phase5-intake-checks.cjs'
            : './phase4-inventory-checks.cjs',
      )(context);
      const result = {
        time: new Date().toISOString(),
        mode,
        scope: 'Isolated real HTTP/PostgreSQL/Redis/MinIO/BullMQ. Local ONNX segmentation; recognition/edit mock, no external inference.',
        database: 'rezona_phase71_qa:55452',
        liveCalls: 0,
        passed: true,
        checks,
      };
      await fs.mkdir(path.join(root, 'docs/benchmarks/phase7-1'), { recursive: true });
      await fs.writeFile(
        path.join(root, `docs/benchmarks/phase7-1/${mode}.json`),
        JSON.stringify(result, null, 2),
      );
      console.log(JSON.stringify(result, null, 2));
    }
  } finally {
    if (mode !== 'serve') await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
