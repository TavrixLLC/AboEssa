import { Prisma, PrismaClient } from '@prisma/client';
import { IMAGE_RECIPE } from '../image-optimization/image-recipe';

type Options = { apply: boolean; retryFailed: boolean; limit: number; batchSize: number };

export async function scheduleImageBackfill(prisma: PrismaClient, options: Options) {
  const { apply, retryFailed, limit, batchSize } = options;
  let lastId: string | undefined;
  let scanned = 0;
  let scheduled = 0;
  while (scanned < limit) {
    const batch: { id: string }[] = await prisma.fileAsset.findMany({
      where: {
        id: lastId ? { gt: lastId } : undefined,
        uploadedByCustomerId: null,
        OR: [{ key: { startsWith: 'products/' } }, { key: { startsWith: 'auctions/' } }],
        mimeType: { in: ['image/jpeg', 'image/png', 'image/webp'] },
        imageJobs: retryFailed
          ? { some: { recipeVersion: IMAGE_RECIPE, status: 'FAILED' } }
          : { none: { recipeVersion: IMAGE_RECIPE } },
      },
      select: { id: true },
      take: Math.min(batchSize, limit - scanned),
      orderBy: { id: 'asc' },
    });
    if (!batch.length) break;
    lastId = batch[batch.length - 1].id;
    scanned += batch.length;
    if (!apply) continue;

    const result = retryFailed
      ? await prisma.fileAssetImageJob.updateMany({
          where: {
            assetId: { in: batch.map(({ id }) => id) },
            recipeVersion: IMAGE_RECIPE,
            status: 'FAILED',
          },
          data: { status: 'PENDING', attempts: 0, errorCode: null, nextDispatchAt: new Date() },
        })
      : await prisma.fileAssetImageJob.createMany({
          data: batch.map(({ id }) => ({ assetId: id, recipeVersion: IMAGE_RECIPE })),
          skipDuplicates: true,
        });
    scheduled += result.count;
    console.log(JSON.stringify({ phase: 'batch', scanned, scheduled, lastId }));
  }
  return {
    mode: apply ? 'apply' : 'dry-run',
    retryFailed,
    recipe: IMAGE_RECIPE,
    scanned,
    scheduled,
  };
}

function parseArgs(args: string[]): Options {
  const options = { apply: false, retryFailed: false, limit: 500, batchSize: 50 };
  for (const arg of args) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--retry-failed') options.retryFailed = true;
    else {
      const match = /^(--limit|--batch-size)=(\d+)$/.exec(arg);
      if (!match) throw new Error('Use [--apply] [--retry-failed] [--limit=N] [--batch-size=N]');
      const value = Number(match[2]);
      if (value < 1 || value > (match[1] === '--limit' ? 5000 : 200)) {
        throw new Error('Limit must be 1–5000 and batch size 1–200');
      }
      if (match[1] === '--limit') options.limit = value;
      else options.batchSize = value;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const datasourceUrl = process.env.IMAGE_BACKFILL_DATABASE_URL;
  if (!datasourceUrl)
    throw new Error('Set IMAGE_BACKFILL_DATABASE_URL explicitly; no implicit DB is used');
  const target = new URL(datasourceUrl);
  if (!['postgresql:', 'postgres:'].includes(target.protocol) || target.pathname.length < 2)
    throw new Error('Expected an explicit PostgreSQL database URL');
  if (options.apply && process.env.IMAGE_BACKFILL_CONFIRM_DATABASE !== target.pathname.slice(1)) {
    throw new Error('Set IMAGE_BACKFILL_CONFIRM_DATABASE to the exact target database name');
  }
  const client = new PrismaClient({ datasourceUrl });
  try {
    console.log(JSON.stringify(await scheduleImageBackfill(client, options)));
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    // Prisma errors can contain datasource information; keep credentials out of CLI output.
    console.error(
      error instanceof Prisma.PrismaClientKnownRequestError
        ? `Backfill failed (${error.code})`
        : error instanceof Prisma.PrismaClientInitializationError
          ? 'Backfill database unavailable'
          : error instanceof Error && /^(Use |Limit |Set |Expected )/.test(error.message)
            ? error.message
            : 'Image backfill failed; rerun after resolving the problem',
    );
    process.exitCode = 1;
  });
}
