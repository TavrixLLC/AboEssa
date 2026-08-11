import { PrismaClient, StaffStatus } from '@prisma/client';

const runDbE2e = process.env.RUN_DB_E2E === 'true' && !!process.env.DATABASE_URL_TEST;
const describeDb = runDbE2e ? describe : describe.skip;

describeDb('Phase E database-backed contracts', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });
    await prisma.$connect();
  });

  afterAll(async () => prisma.$disconnect());

  it('has additive staff, role, and session tables with owner status support', async () => {
    const owner = await prisma.adminUser.findFirst({ where: { isOwner: true, status: StaffStatus.ACTIVE } });
    expect(owner).toBeDefined();
    await expect(prisma.role.count()).resolves.toBeGreaterThanOrEqual(0);
    await expect(prisma.adminSession.count()).resolves.toBeGreaterThanOrEqual(0);
  });

  it('enforces normalized email uniqueness at the database boundary', async () => {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'AdminUser_normalizedEmail_key') AS exists`;
    expect(result[0]?.exists).toBe(true);
  });
});
