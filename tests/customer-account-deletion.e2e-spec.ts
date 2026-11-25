import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { TokenService } from 'src/auth/token.service';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { ResponseEnvelopeInterceptor } from 'src/common/interceptors/response-envelope.interceptor';
import { PasswordService } from 'src/common/security/password.service';
import { CustomerAuthController } from 'src/customer-auth/customer-auth.controller';
import { CustomerAuthService } from 'src/customer-auth/customer-auth.service';
import { PermissionResolverService } from 'src/permissions/permission-resolver.service';
import { PrismaService } from 'src/prisma/prisma.service';

// No production URL/.env fallback. Only the disposable localhost QA DB is allowed.
const url = process.env.ACCOUNT_QA_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('Account deletion / real HTTP + Postgres + Argon2', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const password = 'AccountQaPass123';
  const previousSecret = process.env.JWT_CUSTOMER_ACCESS_SECRET;
  beforeAll(async () => {
    const target = new URL(url!);
    const realStudio=process.env.REZONA_REAL_STUDIO_QA==='1'&&target.hostname==='127.0.0.1'&&target.port==='55456'&&/^\/rezona_real_studio_reg_[a-f0-9]{8}$/.test(target.pathname);
    const studio20=process.env.REZONA_STUDIO20_QA==='1'&&target.hostname==='127.0.0.1'&&target.port==='55455'&&/^\/rezona_studio20_reg_[a-f0-9]{8}$/.test(target.pathname);
    const phase72 = process.env.REZONA_PHASE72_QA === '1' && target.hostname === '127.0.0.1' && target.port === '55454' && target.pathname === '/rezona_phase72_e2e';
    const phase71 = process.env.REZONA_PHASE71_QA === '1' && target.hostname === '127.0.0.1' && target.port === '55452' && target.pathname === '/rezona_phase71_qa';
    const phase7 = process.env.REZONA_PHASE7_QA === '1' && target.hostname === '127.0.0.1' && target.port === '55450' && target.pathname === '/rezona_phase7_qa';
    const phase6 = process.env.REZONA_PHASE6_QA === '1' && target.hostname === '127.0.0.1' &&
      target.port === '55448' && target.pathname === '/rezona_phase6_qa';
    const phase5 =
      process.env.REZONA_PHASE5_QA === '1' &&
      target.hostname === '127.0.0.1' &&
      target.port === '55446' &&
      target.pathname === '/rezona_phase5_qa';
    const phase4 =
      process.env.REZONA_PHASE4_QA === '1' &&
      target.hostname === '127.0.0.1' &&
      target.port === '55444' &&
      target.pathname === '/rezona_phase4_qa';
    if (
      !phase4 &&
      !phase5 &&
      !phase6 &&
      !phase7 &&
      !phase71 &&
      !phase72 &&
      !studio20 &&
      !realStudio &&
      (target.hostname !== '127.0.0.1' ||
        target.port !== '55439' ||
        target.pathname !== '/rezona_admin_qa')
    ) {
      throw new Error('Refusing account-deletion tests outside the isolated local QA database');
    }
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.$connect();
    const secret = randomUUID();
    process.env.JWT_CUSTOMER_ACCESS_SECRET = secret;
    const config = new ConfigService({
      jwt: { customerAccessSecret: secret, customerAccessTtl: '15m' },
    });
    const module = await Test.createTestingModule({
      controllers: [CustomerAuthController],
      providers: [
        CustomerAuthService,
        PasswordService,
        TokenService,
        JwtService,
        JwtAccessGuard,
        AuditLogsService,
        { provide: PrismaService, useValue: db },
        { provide: ConfigService, useValue: config },
        { provide: PermissionResolverService, useValue: { forAdmin: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (previousSecret === undefined) delete process.env.JWT_CUSTOMER_ACCESS_SECRET;
    else process.env.JWT_CUSTOMER_ACCESS_SECRET = previousSecret;
  });

  async function register() {
    const phone = `+96477${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;
    const result = await request(app.getHttpServer())
      .post('/api/auth/customer/register')
      .send({ phone, password, displayName: 'Deletion QA only' })
      .expect(201);
    return { ...result.body.data, phone };
  }
  it('deletes only the signed-in account, scrubs delivery snapshots and revokes old tokens', async () => {
    const owner = await register();
    const other = await register();
    const address = await db.customerAddress.create({
      data: {
        customerId: owner.customer.id,
        fullName: 'Private name',
        phone: owner.phone,
        governorate: 'QA',
        city: 'QA',
        addressLine: 'Private address',
      },
    });
    const order = await db.order.create({
      data: {
        customerId: owner.customer.id,
        notes: 'private order note',
        totalAmount: 10000,
        itemsCount: 1,
        items: {
          create: {
            customerId: owner.customer.id,
            source: 'APP_FIXED_PRICE',
            price: 10000,
            barcode: randomUUID(),
            deliveryPhone: owner.phone,
            deliveryAddressSnapshot: { fullName: 'Private name' },
          },
        },
      },
      include: { items: true },
    });
    await db.shipmentRequest.create({
      data: {
        customerId: owner.customer.id,
        addressId: address.id,
        totalAmount: 10000,
        customerNote: 'private note',
        adminNote: 'private contact',
        addressSnapshot: { fullName: 'Private name' },
      },
    });
    await request(app.getHttpServer())
      .post('/api/auth/customer/delete-account')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ password, customerId: other.customer.id })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/customer/delete-account')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ password })
      .expect(200)
      .expect(({ body }) => expect(body.data.deleted).toBe(true));
    const deleted = await db.customer.findUniqueOrThrow({ where: { id: owner.customer.id } });
    expect(deleted).toMatchObject({
      displayName: 'Deleted customer',
      phone: null,
      passwordHash: null,
      refreshTokenHash: null,
      status: 'BLOCKED',
    });
    expect(deleted.deletedAt).not.toBeNull();
    expect(await db.customerAddress.count({ where: { customerId: deleted.id } })).toBe(0);
    expect(await db.orderItem.findUnique({ where: { id: order.items[0].id } })).toMatchObject({
      deliveryPhone: null,
      deliveryAddressSnapshot: null,
      price: expect.anything(),
    });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).notes).toBeNull();
    expect(await db.shipmentRequest.findFirst({ where: { customerId: deleted.id } })).toMatchObject(
      { addressId: null, addressSnapshot: null, customerNote: null, adminNote: null },
    );
    await request(app.getHttpServer())
      .get('/api/auth/customer/me')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/customer/refresh')
      .send({ refreshToken: owner.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/customer/login')
      .send({ phone: owner.phone, password })
      .expect(401);
    expect(
      (await db.customer.findUniqueOrThrow({ where: { id: other.customer.id } })).deletedAt,
    ).toBeNull();
  });
  it('wrong password leaves the account and session usable', async () => {
    const owner = await register();
    await request(app.getHttpServer())
      .post('/api/auth/customer/delete-account')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ password: 'wrong' })
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/customer/me')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(
      (await db.customer.findUniqueOrThrow({ where: { id: owner.customer.id } })).deletedAt,
    ).toBeNull();
  });
  it('requires a customer token and a non-empty password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/customer/delete-account')
      .send({ password })
      .expect(401);
    const owner = await register();
    await request(app.getHttpServer())
      .post('/api/auth/customer/delete-account')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ password: '' })
      .expect(400);
  });
  it('public web deletion uses the same erasure transaction', async () => {
    const owner = await register();
    await request(app.getHttpServer())
      .post('/api/auth/customer/delete-account-request')
      .send({ phone: owner.phone, password })
      .expect(200);
    expect(
      (await db.customer.findUniqueOrThrow({ where: { id: owner.customer.id } })).phone,
    ).toBeNull();
  });
});
