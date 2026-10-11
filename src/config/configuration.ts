export default () => ({
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
    screenAccessSecret: process.env.JWT_SCREEN_ACCESS_SECRET,
    adminAccessTtl: process.env.JWT_ADMIN_ACCESS_TTL ?? '15m',
    customerAccessTtl: process.env.JWT_CUSTOMER_ACCESS_TTL ?? '15m',
    screenAccessTtl: process.env.JWT_SCREEN_ACCESS_TTL ?? '365d',
    refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 30),
  },
  screens: {
    pairingTtlSeconds: Number(process.env.SCREEN_PAIRING_TTL_SECONDS ?? 300),
    onlineWindowSeconds: Number(process.env.SCREEN_ONLINE_WINDOW_SECONDS ?? 120),
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
