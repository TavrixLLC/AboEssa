import { ConfigService } from '@nestjs/config';
import { assertStudioDispatchReleasePolicy } from 'src/image-enhancement/studio-release-policy';
import { STUDIO_TEMPLATES, studioCatalog } from 'src/image-enhancement/studio-templates';
import { envValidationSchema } from 'src/config/env.validation';
import { Test } from '@nestjs/testing';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AdminAuthController } from 'src/admin-auth/admin-auth.controller';
import { AdminAuthService } from 'src/admin-auth/admin-auth.service';
import { StaffService } from 'src/admin-users/staff.service';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Server } from 'node:http';
import { defineConfig } from '@prisma/config';
import * as Schema from 'effect/Schema';

describe('Admin Stage A release fences', () => {
  it('keeps dist/src/main.js stable when the release context omits seed/test sources', () => {
    const config = JSON.parse(readFileSync('tsconfig.build.json', 'utf8')) as {
      compilerOptions: { rootDir: string };
      include: string[];
    };
    expect(config.compilerOptions.rootDir).toBe('.');
    expect(config.include).toEqual(['src/**/*.ts']);
  });
  it('uses patched Effect for the pinned Prisma config without a Prisma major upgrade', () => {
    const resolved = require.resolve('effect/package.json', {
      paths: [dirname(require.resolve('@prisma/config/package.json'))],
    });
    expect((JSON.parse(readFileSync(resolved, 'utf8')) as { version: string }).version).toBe(
      '3.22.1',
    );
    expect(defineConfig({ schema: 'prisma/schema.prisma' })).toBeDefined();
    const check = Schema.decodeUnknownSync(
      Schema.TemplateLiteral(Schema.String, ':', Schema.String, ':', Schema.String, 'X'),
    );
    // Compatibility smoke, not an unbounded adversarial benchmark in the test process.
    expect(check('one:two:threeX')).toBe('one:two:threeX');
    expect(() => check(':'.repeat(16))).toThrow();
  });
  it('keeps all20 cards/four groups browsable without enabling paid dispatch', () => {
    expect(studioCatalog()).toHaveLength(20);
    expect(new Set(STUDIO_TEMPLATES.map((t) => t.category)).size).toBe(4);
    expect(() =>
      assertStudioDispatchReleasePolicy(new ConfigService({ NODE_ENV: 'production' }), 'fal'),
    ).toThrow('STUDIO_PAID_DISPATCH_DISABLED');
  });
  it('rejects production mocks even when the dispatch flag is accidentally enabled', () => {
    expect(() =>
      assertStudioDispatchReleasePolicy(
        new ConfigService({ NODE_ENV: 'production', PRODUCT_STUDIO_DISPATCH_ENABLED: 'true' }),
        'mock',
      ),
    ).toThrow('STUDIO_PRODUCTION_MOCK_FORBIDDEN');
  });
  it('an enabled flag alone is only one gate, not account, source, budget or permission approval', () => {
    expect(() =>
      assertStudioDispatchReleasePolicy(
        new ConfigService({ NODE_ENV: 'production', PRODUCT_STUDIO_DISPATCH_ENABLED: 'true' }),
        'fal',
      ),
    ).not.toThrow();
    expect(() =>
      assertStudioDispatchReleasePolicy(
        new ConfigService({ NODE_ENV: 'test', PRODUCT_STUDIO_DISPATCH_ENABLED: 'false' }),
        'fal',
      ),
    ).toThrow();
  });
  it('configuration rejects production QA review and experiment flags', () => {
    for (const name of [
      'REAL_PRODUCT_STUDIO_REVIEW_ENABLED',
      'PRODUCT_STUDIO_PREPAID_EXPERIMENT',
    ]) {
      const { error } = envValidationSchema.validate(
        { NODE_ENV: 'production', [name]: 'true' },
        { abortEarly: false },
      );
      expect(error?.details.some((d) => d.path.includes(name))).toBe(true);
    }
  });
  it('actually enforces the existing five-per-minute Admin login decorator over HTTP', async () => {
    const login = jest.fn().mockResolvedValue({ fixture: true });
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
      controllers: [AdminAuthController],
      providers: [
        ThrottlerGuard,
        { provide: AdminAuthService, useValue: { login } },
        { provide: StaffService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = module.createNestApplication();
    await app.init();
    const server = app.getHttpServer() as Server;
    try {
      for (let i = 0; i < 5; i++)
        await request(server)
          .post('/admin/auth/login')
          .send({ email: 'qa@example.test', password: 'not-a-real-password' })
          .expect(201);
      await request(server)
        .post('/admin/auth/login')
        .send({ email: 'qa@example.test', password: 'not-a-real-password' })
        .expect(429);
      expect(login).toHaveBeenCalledTimes(5);
    } finally {
      await app.close();
    }
  });
});
