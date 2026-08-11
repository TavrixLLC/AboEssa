/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { INestApplication, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IdempotencyService } from 'src/common/idempotency/idempotency.service';
import { JwtAccessGuard } from 'src/common/guards/jwt-access.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { ResponseEnvelopeInterceptor } from 'src/common/interceptors/response-envelope.interceptor';
import { SalesController } from 'src/sales/sales.controller';
import { SalesService } from 'src/sales/sales.service';
import { WarehouseController } from 'src/warehouse/warehouse.controller';
import { WarehouseService } from 'src/warehouse/warehouse.service';
import { SaleSource } from '@prisma/client';

describe('Phase B route smoke (e2e)', () => {
  let app: INestApplication;

  const salesService = {
    quickSale: jest.fn().mockResolvedValue({
      customer: { id: 'customer-1', displayName: 'Ahmed' },
      order: { id: 'order-1' },
      items: [{ id: 'item-1', barcode: 'ITEM-20260713-A8K2M9' }],
      labelPrintJobs: [{ id: 'job-1' }],
      labelPayloads: [{ itemBarcode: 'ITEM-20260713-A8K2M9' }],
    }),
  };
  const warehouseService = {
    labelPending: jest.fn().mockResolvedValue({
      items: [{ orderItemId: 'item-2', labelStatus: 'PENDING' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    }),
    printLabel: jest.fn().mockResolvedValue({
      labelPrintJob: { id: 'job-2' },
      labelPayload: { itemBarcode: 'ITEM-20260713-Z9Z9Z9' },
    }),
    confirmLabelAttached: jest.fn(),
    customerBoxes: jest.fn(),
    customerBoxDetails: jest.fn(),
    searchItems: jest.fn(),
  };
  const idempotencyService = {
    requireKey: jest.fn().mockReturnValue('idem-1'),
    hashBody: jest.fn().mockReturnValue('hash-1'),
    getReplayOrThrowConflict: jest.fn().mockResolvedValue(undefined),
    store: jest.fn().mockResolvedValue({}),
    getExpiryDate: jest.fn().mockReturnValue(new Date(Date.now() + 86400_000)),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SalesController, WarehouseController],
      providers: [
        { provide: SalesService, useValue: salesService },
        { provide: WarehouseService, useValue: warehouseService },
        { provide: IdempotencyService, useValue: idempotencyService },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { id: 'admin-1', type: 'admin', actorType: 'ADMIN', permissions: [] };
          return true;
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a quick sale through HTTP', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/sales/quick')
      .set('Idempotency-Key', 'idem-1')
      .send({
        customerId: 'customer-1',
        categoryId: 'cat-1',
        price: 4000,
        source: SaleSource.TIKTOK_LIVE_MANUAL,
        printNow: true,
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.items[0].barcode).toBe('ITEM-20260713-A8K2M9');
  });

  it('lists warehouse pending labels through HTTP', async () => {
    const response = await request(app.getHttpServer()).get('/api/admin/warehouse/label-pending').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.items[0].labelStatus).toBe('PENDING');
  });
});
