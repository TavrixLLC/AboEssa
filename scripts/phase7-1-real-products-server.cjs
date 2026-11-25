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
const mode = 'serve';
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
  AI_RECOGNITION_PROVIDER: 'gemini',
  IMAGE_ENHANCEMENT_ENABLED: 'true',
  IMAGE_ENHANCEMENT_LOCAL_ENABLED: 'true',
  IMAGE_LOCAL_MATTING_ENABLED: 'true',
  IMAGE_NEURAL_SEGMENTATION_ENABLED: 'true',
  IMAGE_SEGMENTATION_MODEL: 'u2net',
  IMAGE_SEGMENTATION_MODEL_DIRECTORY: 'D:/rezona-phase7-1-qa/models',
  IMAGE_SEGMENTATION_RUNTIME_DIRECTORY: 'D:/rezona-phase7-1-qa/runtime',
  IMAGE_AI_ENABLED: 'false',
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
const { AppModule } = require('../dist/src/app.module');

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
  console.log('REAL-PRODUCT INTAKE QA ready on http://127.0.0.1:18493/api; existing admin login only. No fixture/customer/warehouse/category creation. Gemini live approval false, paid editing off.');
  process.once('SIGINT', async()=>{await app.close();process.exit(0);});
})().catch(e=>{console.error(e.message);process.exitCode=1;});
