import * as Joi from 'joi';

const ttlPattern = /^\d+[smhd]$/;
const placeholderSecretPattern = /(changeme|development-secret|replace-me|password)/i;

function isDevelopmentHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized === '::1' || normalized.endsWith('.local')) {
    return true;
  }
  if (/^(127\.|10\.|192\.168\.)/.test(normalized)) {
    return true;
  }
  const match = normalized.match(/^172\.(\d+)\./);
  return match ? Number(match[1]) >= 16 && Number(match[1]) <= 31 : false;
}

function rejectPlaceholderSecret(value: string, helpers: Joi.CustomHelpers<string>) {
  return placeholderSecretPattern.test(value) || value.trim().toLowerCase() === 'secret'
    ? helpers.error('any.invalid')
    : value;
}

function validateProductionServiceUrl(
  value: string,
  helpers: Joi.CustomHelpers<string>,
  requirePassword: boolean,
) {
  try {
    const url = new URL(value);
    const password = decodeURIComponent(url.password);
    if (
      isDevelopmentHost(url.hostname) ||
      (requirePassword && !password) ||
      (password && placeholderSecretPattern.test(password))
    ) {
      return helpers.error('any.invalid');
    }
  } catch {
    return helpers.error('any.invalid');
  }
  return value;
}

function validateProductionPublicUrl(value: string, helpers: Joi.CustomHelpers<string>) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      isDevelopmentHost(url.hostname) ||
      url.username ||
      url.password
    ) {
      return helpers.error('any.invalid');
    }
  } catch {
    return helpers.error('any.invalid');
  }
  return value;
}

function validateProductionOrigins(value: string, helpers: Joi.CustomHelpers<string>) {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!origins.length || origins.some((origin) => origin === '*')) {
    return helpers.error('any.invalid');
  }

  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (
        url.protocol !== 'https:' ||
        url.origin !== origin.replace(/\/$/, '') ||
        isDevelopmentHost(url.hostname) ||
        url.username ||
        url.password
      ) {
        return helpers.error('any.invalid');
      }
    } catch {
      return helpers.error('any.invalid');
    }
  }

  return origins.join(',');
}

const productionJwtSecret = Joi.string()
  .min(32)
  .custom(rejectPlaceholderSecret, 'production placeholder secret rejection')
  .required();

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api'),
  DATABASE_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .uri({ scheme: ['postgresql', 'postgres'] })
      .custom(
        (value: string, helpers: Joi.CustomHelpers<string>) =>
          validateProductionServiceUrl(value, helpers, true),
        'production database URL validation',
      )
      .required(),
    otherwise: Joi.string()
      .uri({ scheme: ['postgresql', 'postgres'] })
      .required(),
  }),
  REDIS_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .uri({ scheme: ['redis', 'rediss'] })
      .custom(
        (value: string, helpers: Joi.CustomHelpers<string>) =>
          validateProductionServiceUrl(value, helpers, true),
        'production Redis URL validation',
      )
      .required(),
    otherwise: Joi.string()
      .uri({ scheme: ['redis', 'rediss'] })
      .allow('')
      .optional(),
  }),
  JWT_ADMIN_ACCESS_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: productionJwtSecret,
    otherwise: Joi.string().min(32).required(),
  }),
  JWT_CUSTOMER_ACCESS_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: productionJwtSecret,
    otherwise: Joi.string().min(32).required(),
  }),
  JWT_ADMIN_ACCESS_TTL: Joi.string().pattern(ttlPattern).default('15m'),
  JWT_CUSTOMER_ACCESS_TTL: Joi.string().pattern(ttlPattern).default('15m'),
  REFRESH_TOKEN_DAYS: Joi.number().integer().min(1).default(30),
  CORS_ORIGINS: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .allow('')
      .custom(validateProductionOrigins, 'production exact HTTPS origin validation')
      .default(''),
    otherwise: Joi.string().allow('*', '').default(''),
  }),
  TRUST_PROXY_HOPS: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.number().integer().min(1).max(3).default(1),
    otherwise: Joi.number().integer().min(0).max(3).default(0),
  }),
  SWAGGER_ENABLED: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().default(false),
    otherwise: Joi.boolean().default(true),
  }),
  THROTTLE_TTL_MS: Joi.number().integer().min(1000).default(60000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),
  IDEMPOTENCY_TTL_SECONDS: Joi.number().integer().min(60).default(86400),
  UPLOAD_MAX_BYTES: Joi.number().integer().min(1).default(5242880),
  UPLOAD_ALLOWED_MIME: Joi.string().default('image/jpeg,image/png,image/webp'),
  LOCAL_UPLOAD_DIR: Joi.string().default('uploads'),
  IMAGE_OPTIMIZATION_ENABLED: Joi.boolean().default(false),
  INVENTORY_MANAGEMENT_ENABLED: Joi.boolean().default(false),
  RAPID_PRODUCT_INTAKE_ENABLED: Joi.boolean().default(false),
  // Separate Stage A template browser from Stage B external dispatch.
  PRODUCT_STUDIO_DISPATCH_ENABLED: Joi.string().valid('true', 'false').default('false'),
  REAL_PRODUCT_STUDIO_REVIEW_ENABLED: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('false').default('false'),
    otherwise: Joi.string().valid('true', 'false').optional(),
  }),
  PRODUCT_STUDIO_PREPAID_EXPERIMENT: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('false').default('false'),
    otherwise: Joi.string().valid('true', 'false').optional(),
  }),
  IMAGE_MAX_PIXELS: Joi.number().integer().min(1_048_576).max(20_000_000).default(12_000_000),
  IMAGE_OPTIMIZATION_CONCURRENCY: Joi.number().integer().min(1).max(3).default(1),
  PUBLIC_BASE_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .uri({ scheme: ['https'] })
      .custom(validateProductionPublicUrl, 'production public URL validation')
      .required(),
    otherwise: Joi.string().uri().default('http://localhost:8080'),
  }),
  PUSH_PROVIDER: Joi.string().valid('disabled', 'firebase').default('disabled'),
  FIREBASE_SERVICE_ACCOUNT_FILE: Joi.when('PUSH_PROVIDER', {
    is: 'firebase',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().optional(),
  }),
  FIREBASE_PROJECT_ID: Joi.when('PUSH_PROVIDER', {
    is: 'firebase',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().optional(),
  }),
  MINIO_ROOT_USER: Joi.string().optional(),
  MINIO_ROOT_PASSWORD: Joi.string().optional(),
  MINIO_ENDPOINT: Joi.string().default('localhost'),
  MINIO_PORT: Joi.number().port().default(9000),
  MINIO_USE_SSL: Joi.boolean().default(false),
  MINIO_ACCESS_KEY: Joi.string().optional(),
  MINIO_SECRET_KEY: Joi.string().optional(),
  MINIO_BUCKET: Joi.string().default('aboessa-media'),
  SEED_ADMIN_EMAIL: Joi.string().email().optional(),
  SEED_ADMIN_PASSWORD: Joi.string().min(8).optional(),
  SEED_ADMIN_NAME: Joi.string().optional(),
});
