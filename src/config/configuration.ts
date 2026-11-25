export default () => ({
  intake: {enabled:process.env.RAPID_PRODUCT_INTAKE_ENABLED==='true'},
  inventory: { managementEnabled: process.env.INVENTORY_MANAGEMENT_ENABLED === 'true' },
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:8080',
    trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
    swaggerEnabled:
      process.env.SWAGGER_ENABLED === undefined
        ? process.env.NODE_ENV !== 'production'
        : process.env.SWAGGER_ENABLED === 'true',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  cors: {
    origins: process.env.CORS_ORIGINS ?? '',
  },
  jwt: {
    adminAccessSecret: process.env.JWT_ADMIN_ACCESS_SECRET,
    customerAccessSecret: process.env.JWT_CUSTOMER_ACCESS_SECRET,
    adminAccessTtl: process.env.JWT_ADMIN_ACCESS_TTL ?? '15m',
    customerAccessTtl: process.env.JWT_CUSTOMER_ACCESS_TTL ?? '15m',
    refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 30),
  },
  throttle: {
    ttl: Number(process.env.THROTTLE_TTL_MS ?? 60000),
    limit: Number(process.env.THROTTLE_LIMIT ?? 120),
  },
  idempotency: {
    ttlSeconds: Number(process.env.IDEMPOTENCY_TTL_SECONDS ?? 86400),
  },
  upload: {
    maxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? 5242880),
    allowedMime: (process.env.UPLOAD_ALLOWED_MIME ?? 'image/jpeg,image/png,image/webp')
      .split(',')
      .map((mime) => mime.trim())
      .filter(Boolean),
    localDir: process.env.LOCAL_UPLOAD_DIR ?? 'uploads',
  },
  imageOptimization: {
    enabled: process.env.IMAGE_OPTIMIZATION_ENABLED === 'true',
    maxPixels: Number(process.env.IMAGE_MAX_PIXELS ?? 12000000),
    concurrency: Number(process.env.IMAGE_OPTIMIZATION_CONCURRENCY ?? 1),
  },
  storage: {
    minio: {
      endpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
      port: Number(process.env.MINIO_PORT ?? 9000),
      useSsl: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY ?? process.env.MINIO_ROOT_USER,
      secretKey: process.env.MINIO_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD,
      bucket: process.env.MINIO_BUCKET ?? 'aboessa-media',
    },
  },
  push: {
    provider: process.env.PUSH_PROVIDER ?? 'disabled',
    firebaseServiceAccountFile: process.env.FIREBASE_SERVICE_ACCOUNT_FILE,
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  },
});
