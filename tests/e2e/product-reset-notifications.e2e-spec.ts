import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminRole, StaffStatus } from '@prisma/client';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { IdempotencyService } from 'src/common/idempotency/idempotency.service';
import { ResponseEnvelopeInterceptor } from 'src/common/interceptors/response-envelope.interceptor';
import { TokenType } from 'src/common/enums/token-type.enum';
import { AdminNotificationsController } from 'src/notifications/admin-notifications.controller';
import { AdminNotificationsService } from 'src/notifications/admin-notifications.service';
import { PermissionResolverService } from 'src/permissions/permission-resolver.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PasswordService } from 'src/common/security/password.service';

describe('Admin notification authorization (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const permissions = jest.fn<Promise<string[]>, []>();
  const service = {
    send: jest.fn().mockResolvedValue({
      campaignId: 'campaign-1',
      recipientCount: 1,
      createdCount: 1,
      failedCount: 0,
      status: 'SENT',
    }),
    preview: jest.fn(),
    list: jest.fn(),
    details: jest.fn(),
  };

  beforeAll(async () => {
    process.env.JWT_ADMIN_ACCESS_SECRET = 'phase-d6-test-secret-at-least-32-characters';
    const jwt = new JwtService();
    token = await jwt.signAsync(
      {
        sub: 'admin-1',
        type: TokenType.Admin,
        tokenVersion: 0,
      },
      { secret: process.env.JWT_ADMIN_ACCESS_SECRET },
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminNotificationsController],
      providers: [
        JwtAccessGuard,
        PermissionsGuard,
        JwtService,
        {
          provide: PasswordService,
          useValue: { verify: jest.fn().mockResolvedValue(true) },
        },
        { provide: AdminNotificationsService, useValue: service },
        {
          provide: IdempotencyService,
          useValue: {
            requireKey: jest.fn().mockReturnValue('idem-1'),
            hashBody: jest.fn().mockReturnValue('hash-1'),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            adminUser: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'admin-1',
                role: AdminRole.ADMIN,
                status: StaffStatus.ACTIVE,
                isActive: true,
                isOwner: false,
                mustChangePassword: false,
                tokenVersion: 0,
              }),
            },
          },
        },
        {
          provide: PermissionResolverService,
          useValue: { forAdmin: permissions },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.JWT_ADMIN_ACCESS_SECRET;
  });

  const payload = {
    audienceType: 'ONE_CUSTOMER',
    customerId: 'customer-1',
    titleAr: 'عنوان',
    bodyAr: 'نص',
    linkType: 'NONE',
  };

  it('requires authentication for notification send', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/notifications/send')
      .set('Idempotency-Key', 'idem-1')
      .send(payload)
      .expect(401);
  });

  it('returns 403 when authenticated staff lacks notifications.send', async () => {
    permissions.mockResolvedValueOnce([]);
    await request(app.getHttpServer())
      .post('/api/admin/notifications/send')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'idem-1')
      .send(payload)
      .expect(403);
  });

  it('allows explicitly permitted staff to send', async () => {
    permissions.mockResolvedValueOnce(['notifications.send']);
    const response = await request(app.getHttpServer())
      .post('/api/admin/notifications/send')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'idem-1')
      .send(payload)
      .expect(201);
    expect(response.body.data).toMatchObject({
      campaignId: 'campaign-1',
      recipientCount: 1,
    });
  });

  it('rejects LIVE as an unsupported destination before the service runs', async () => {
    permissions.mockResolvedValueOnce(['notifications.send']);
    await request(app.getHttpServer())
      .post('/api/admin/notifications/send')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'idem-live')
      .send({ ...payload, linkType: 'LIVE', linkTargetId: 'legacy-live' })
      .expect(400);
  });
});
