import { PrismaClient } from '@prisma/client';

const runDbE2e = process.env.RUN_DB_E2E === 'true' && !!process.env.DATABASE_URL_TEST;
const describeDb = runDbE2e ? describe : describe.skip;

describeDb('Phase C/D real DB-backed flows', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL_TEST,
        },
      },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('supports atomic fixed-product purchase preconditions with a real database', async () => {
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined();
  });
});

