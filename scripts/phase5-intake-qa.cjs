// Explicit isolated QA only; never loads dotenv or accepts a database URL.
if (process.env.REZONA_PHASE5_QA !== '1') throw Error('Explicit Phase 5 QA flag required');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
// Nest's normal ConfigModule looks for .env in cwd. Boot from a controlled
// directory with no .env so a repository deployment file is never consulted.
const qaConfigDirectory = 'D:/rezona-phase5-qa';
require('node:fs').mkdirSync(qaConfigDirectory, { recursive: true });
if (require('node:fs').existsSync(path.join(qaConfigDirectory, '.env')))
  throw Error('Unexpected QA dotenv file');
process.chdir(qaConfigDirectory);
const mode = process.argv[2] || 'checks';
if (!['checks', 'serve', 'regressions'].includes(mode)) throw Error('Invalid QA mode');
const port = mode === 'serve' ? 58463 : 58465,
  origin = `http://127.0.0.1:${port}`;
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://phase5_qa:phase5-local-only@127.0.0.1:55446/rezona_phase5_qa',
  REDIS_URL: 'redis://127.0.0.1:56386',
  MINIO_ENDPOINT: '127.0.0.1',
  MINIO_PORT: '59046',
  MINIO_USE_SSL: 'false',
  MINIO_ACCESS_KEY: 'phase5-qa',
  MINIO_SECRET_KEY: 'phase5-local-only',
  MINIO_BUCKET: 'phase5-qa',
  JWT_ADMIN_ACCESS_SECRET: randomUUID() + randomUUID(),
  JWT_CUSTOMER_ACCESS_SECRET: randomUUID() + randomUUID(),
  PUSH_PROVIDER: 'disabled',
  IMAGE_OPTIMIZATION_ENABLED: 'true',
  PUBLIC_BASE_URL: origin,
  API_PREFIX: 'api',
  INVENTORY_MANAGEMENT_ENABLED: 'true',
  RAPID_PRODUCT_INTAKE_ENABLED: 'true',
  THROTTLE_LIMIT: '20000',
});
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { AppModule } = require('../dist/src/app.module');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { TokenService } = require('../dist/src/auth/token.service');
const { HttpExceptionFilter } = require('../dist/src/common/filters/http-exception.filter');
const {
  ResponseEnvelopeInterceptor,
} = require('../dist/src/common/interceptors/response-envelope.interceptor');
async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  await app.listen(port, '127.0.0.1');
  const db = app.get(PrismaService),
    tokens = app.get(TokenService),
    checks = [];
  const email = 'phase5-device-qa@example.test',
    password = 'QaPhase5LocalOnly2026!';
  const { PasswordService } = require('../dist/src/common/security/password.service');
  const owner = await db.adminUser.upsert({
    where: { email },
    create: {
      email,
      normalizedEmail: email,
      name: 'PHASE5 QA OWNER',
      role: 'OWNER',
      isOwner: true,
      passwordHash: await app.get(PasswordService).hash(password),
    },
    update: {},
  });
  const customer = await db.customer.create({
    data: {
      displayName: 'PHASE5 QA BUYER',
      phone: `+1558${Date.now()}`,
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
    const text = await r.text();
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      value = { raw: text.slice(0, 100) };
    }
    return {
      status: r.status,
      data: value.data,
      body: value,
      headers: Object.fromEntries(r.headers),
    };
  };
  try {
    const category = await db.category.create({
      data: { name: 'إِلِكترونيات Phase5 QA', slug: 'phase5-' + randomUUID() },
    });
    const delivery = {
      fullName: 'QA only',
      phone: '+15550100000',
      governorate: 'QA',
      city: 'QA',
      addressLine: 'Disposable QA address',
    };
    if (mode !== 'serve') {
      await require(
        mode === 'regressions' ? './phase4-inventory-checks.cjs' : './phase5-intake-checks.cjs',
      )({
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
      });
      const result = {
        time: new Date().toISOString(),
        database: 'rezona_phase5_qa:55446',
        scope: 'real local HTTP/PostgreSQL/MinIO/BullMQ; no production writes',
        checks,
        passed: true,
      };
      await fs.mkdir(path.resolve(__dirname, '../docs/benchmarks/phase5'), { recursive: true });
      await fs.writeFile(
        path.resolve(
          __dirname,
          `../docs/benchmarks/phase5/${mode === 'regressions' ? 'inventory-commerce-regressions' : 'integration'}.json`,
        ),
        JSON.stringify(result, null, 2),
      );
      console.log(JSON.stringify(result, null, 2));
    } else {
      await fs.mkdir('D:/rezona-phase5-qa', { recursive: true });
      await fs.writeFile(
        'D:/rezona-phase5-qa/device-defines.json',
        JSON.stringify({
          API_BASE_URL: origin,
          SOCKET_URL: origin,
          APP_ENV: 'local',
          INVENTORY_MANAGEMENT_ENABLED: 'true',
          RAPID_PRODUCT_INTAKE_ENABLED: 'true',
          PHASE5_QA_EMAIL: email,
          PHASE5_QA_PASSWORD: password,
        }),
      );
      console.log(
        'Isolated QA server ready on 127.0.0.1:58463; synthetic login defines outside repository.',
      );
      const stop = async () => {
        await app.close();
        process.exit(0);
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      await new Promise(() => {});
    }
  } finally {
    if (mode !== 'serve') await app.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  process.exit(1);
});
