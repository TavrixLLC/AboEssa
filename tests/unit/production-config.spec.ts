import { envValidationSchema } from 'src/config/env.validation';

const secureProductionEnvironment = () => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://postgres:correct-horse-battery-staple@postgres:5432/live_commerce',
  REDIS_URL: 'redis://:correct-horse-battery-staple@redis:6379',
  JWT_ADMIN_ACCESS_SECRET: 'admin-7B2vJ8qL4xN9mK6pR3tY5uW1aC8dF0hZ',
  JWT_CUSTOMER_ACCESS_SECRET: 'customer-9K4mP7sT2wX6bD1fH8jL3nQ5rV0yC',
  JWT_SCREEN_ACCESS_SECRET: 'screen-5M8qR2vX7cL1nD9hK4pT6wY3bF0sJ',
  CORS_ORIGINS: 'https://admin.example.com',
  PUBLIC_BASE_URL: 'https://api.example.com',
  PUSH_PROVIDER: 'disabled',
});

describe('production runtime configuration', () => {
  it('accepts a complete secure production environment and applies safe defaults', () => {
    const result = envValidationSchema.validate(secureProductionEnvironment(), {
      abortEarly: false,
    });

    expect(result.error).toBeUndefined();
    expect(result.value.TRUST_PROXY_HOPS).toBe(1);
    expect(result.value.SWAGGER_ENABLED).toBe(false);
  });

  it.each([
    [
      'placeholder JWT secret',
      { JWT_ADMIN_ACCESS_SECRET: 'development-secret-development-secret' },
    ],
    ['Redis without authentication', { REDIS_URL: 'redis://redis:6379' }],
    [
      'development database password',
      { DATABASE_URL: 'postgresql://postgres:password@postgres:5432/live_commerce' },
    ],
    ['wildcard CORS', { CORS_ORIGINS: '*' }],
    ['non-HTTPS CORS', { CORS_ORIGINS: 'http://admin.example.com' }],
    ['development public URL', { PUBLIC_BASE_URL: 'https://localhost:8080' }],
  ])('rejects %s', (_label, override) => {
    const result = envValidationSchema.validate(
      { ...secureProductionEnvironment(), ...override },
      { abortEarly: false },
    );

    expect(result.error).toBeDefined();
  });

  it('requires the Firebase project ID with the Firebase provider', () => {
    const result = envValidationSchema.validate(
      {
        ...secureProductionEnvironment(),
        PUSH_PROVIDER: 'firebase',
        FIREBASE_SERVICE_ACCOUNT_FILE: '/run/secrets/firebase-admin.json',
      },
      { abortEarly: false },
    );

    expect(result.error).toBeDefined();
  });

  it('allows an empty browser-origin list so native-only production can deny browser CORS', () => {
    const result = envValidationSchema.validate(
      { ...secureProductionEnvironment(), CORS_ORIGINS: '' },
      { abortEarly: false },
    );

    expect(result.error).toBeUndefined();
  });
});
