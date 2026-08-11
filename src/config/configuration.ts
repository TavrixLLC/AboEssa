export default () => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:8080',
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
    screenAccessTtl: process.env.JWT_SCREEN_ACCESS_TTL ?? '30m',
    refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 30),
  },
  throttle: {
    ttl: Number(process.env.THROTTLE_TTL_MS ?? 60000),
    limit: Number(process.env.THROTTLE_LIMIT ?? 120),
  },
  otp: {
    ttlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 300),
    cooldownSeconds: Number(process.env.OTP_COOLDOWN_SECONDS ?? 60),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
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
});
