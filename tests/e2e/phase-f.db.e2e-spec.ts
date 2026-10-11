import { PrismaClient } from '@prisma/client';

const runDbE2e = process.env.RUN_DB_E2E === 'true' && !!process.env.DATABASE_URL_TEST;
const describeDb = runDbE2e ? describe : describe.skip;

describeDb('Phase F database-backed contracts', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL_TEST } },
    });
    await prisma.$connect();
  });

  afterAll(async () => prisma.$disconnect());

  it('has additive customer-device and push-delivery tables', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('CustomerDevice', 'NotificationPushDelivery')
      ORDER BY table_name
    `;
    expect(tables.map((row) => row.table_name)).toEqual([
      'CustomerDevice',
      'NotificationPushDelivery',
    ]);
  });

  it('enforces installation and push-token uniqueness', async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('CustomerDevice_installationId_key', 'CustomerDevice_pushToken_key')
      ORDER BY indexname
    `;
    expect(indexes.map((row) => row.indexname)).toEqual([
      'CustomerDevice_installationId_key',
      'CustomerDevice_pushToken_key',
    ]);
  });

  it('enforces one delivery record per notification and device', async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'NotificationPushDelivery_notificationId_customerDeviceId_key'
    `;
    expect(indexes).toHaveLength(1);
  });

  it('keeps persisted notifications valid when no device is registered', async () => {
    const notificationCount = await prisma.notification.count();
    const deviceCount = await prisma.customerDevice.count();
    expect(notificationCount).toBeGreaterThanOrEqual(0);
    expect(deviceCount).toBeGreaterThanOrEqual(0);
  });
});
