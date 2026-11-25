import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { RecognitionBudgetService } from 'src/ai/recognition-budget.service';
import { STUDIO_TEMPLATES, studioPromptHash } from 'src/image-enhancement/studio-templates';
import { assertStudioLibraryApproved } from 'src/image-enhancement/studio-library.config';

describe('studio20 shared budget — fake accounting fixtures, no inference', () => {
  const t = STUDIO_TEMPLATES[5],
    selection = {
      templateId: t.id,
      templateVersion: 1,
      processingMode: 'GENERATIVE_3D_HERO' as const,
      sourceKind: 'BOX' as const,
    };
  const c = () =>
    new ConfigService({
      PRODUCT_STUDIO_ENABLED: 'true',
      PRODUCT_STUDIO_PROVIDER: 'fal',
      PRODUCT_STUDIO_LIVE_APPROVED: 'true',
      DATABASE_URL: 'postgresql://fake:fake@127.0.0.1:55455/rezona_studio20_qa_12345678',
      NODE_ENV: 'test',
      PRODUCT_STUDIO_PRIVATE_TRANSFER_APPROVED: 'true',
      PRODUCT_STUDIO_TERMS_REVIEWED: 'true',
      FAL_KEY: 'fake-accounting-only-not-a-real-key',
      PRODUCT_STUDIO_MODEL_REVISION: 'synthetic-reviewed-contract-v1',
      PRODUCT_STUDIO_APPROVAL_ID: 'synthetic_accounting_only',
      PRODUCT_STUDIO_MAX_CONCURRENCY: '1',
      PRODUCT_STUDIO_MAX_REGENERATIONS: '0',
      PRODUCT_STUDIO_MONTHLY_BUDGET_USD: '10',
      PRODUCT_STUDIO_DAILY_BUDGET_USD: '1.50',
      PRODUCT_STUDIO_PILOT_BUDGET_USD: '.20',
      PRODUCT_STUDIO_PRIOR_COMMITMENT_USD: '1.044480',
      PRODUCT_STUDIO_MAX_REQUESTS: '4',
      PRODUCT_STUDIO_APPROVED_SCOPE_JSON: JSON.stringify([
        {
          templateId: t.id,
          version: 1,
          mode: selection.processingMode,
          promptHash: studioPromptHash(t, selection.processingMode),
        },
      ]),
      PRODUCT_STUDIO_APPROVED_SOURCES_JSON: JSON.stringify([
        { sourceHash: 'a'.repeat(64), maskHash: 'b'.repeat(64) },
      ]),
      PRODUCT_STUDIO_REVIEWED_PRICING_JSON: JSON.stringify({
        model: 'google/nano-banana-lite/edit',
        currency: 'USD',
        unit: 'units',
        unitPriceUsd: '0.05',
        maxBillableUnits: '2',
        reviewedAt: new Date().toISOString(),
        quoteFingerprint: 'c'.repeat(64),
        evidenceId: 'fal-reviewed-synthetic-accounting',
        sourceUrl: 'https://api.fal.ai/v1/models/pricing',
      }),
      AI_MONTHLY_BUDGET_USD: '10',
      AI_DAILY_BUDGET_USD: '1.50',
      IMAGE_AI_MONTHLY_BUDGET_USD: '10',
      IMAGE_AI_DAILY_BUDGET_USD: '1.50',
    });
  function setup(
    overrides: {
      monthly?: string;
      daily?: string;
      pair?: number;
      unknown?: number;
      busy?: number;
    } = {},
  ) {
    const config = c();
    config.set('PRODUCT_STUDIO_PILOT_BUDGET_USD', '0.20');
    const profile = assertStudioLibraryApproved(config, selection);
    const job = {
      id: 'job',
      attempts: 1,
      actorId: 'employee',
      provider: 'fal',
      model: profile.model,
      modelRevision: profile.revision,
      mode: 'PRODUCT_STUDIO_HERO',
      generation: 0,
      sourceHash: 'a'.repeat(64),
      parameters: {
        studioSelection: selection,
        maskHash: 'b'.repeat(64),
        styleHash: profile.styleHash,
        promptHash: profile.promptHash,
      },
    };
    const usage = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'entry', ...data }),
      ),
      count: jest.fn(
        ({
          where,
        }: {
          where: {
            enhancementJob?: { sourceHash?: string };
            provider?: string;
            status?: string | { in?: string[] };
          };
        }) =>
          Promise.resolve(
            where.enhancementJob?.sourceHash
              ? (overrides.pair ?? 0)
              : where.provider === 'fal' && typeof where.status === 'object' && where.status.in
                ? (overrides.unknown ?? 0)
                : where.status === 'RESERVED'
                  ? (overrides.busy ?? 0)
                  : 0,
          ),
      ),
      aggregate: jest.fn(({ where }: { where: { createdAt?: { gte?: Date } } }) =>
        Promise.resolve({
          _sum: {
            committedUsd: new Prisma.Decimal(
              where.createdAt?.gte?.getUTCDate() === 1
                ? (overrides.monthly ?? '0')
                : (overrides.daily ?? '0'),
            ),
          },
        }),
      ),
    };
    const db = {
      $queryRaw: jest.fn(),
      recognitionUsage: usage,
      $transaction: (f: (tx: unknown) => unknown) => f(db),
    };
    return { db, config, job, service: new RecognitionBudgetService(db as never, config), usage };
  }
  it('reserves the reviewed quote ceiling, not an assumed fixed actual charge; append-only historical carry retained', async () => {
    const x = setup();
    const entry = await x.service.reserveImage(x.job as never);
    expect(entry.reservedUsd.toString()).toBe('0.1');
    expect(entry.committedUsd.toString()).toBe('0.1');
    expect(entry.usageDetails).toMatchObject({
      studioSelection: selection,
      promptHash: studioPromptHash(t, selection.processingMode),
      actualCharge: 'UNKNOWN_UNTIL_RECONCILED',
    });
  });
  it.each([{ daily: '0.40' }, { pair: 1 }, { unknown: 1 }, { busy: 1 }])(
    'blocks carried-budget exhaustion, same source/template replay, unknown and concurrency: %p',
    async (limits) => {
      const x = setup(limits);
      await expect(x.service.reserveImage(x.job as never)).rejects.toThrow();
      expect(x.usage.create).not.toHaveBeenCalled();
    },
  );
  it('missing/stale pricing, permission scope, unapproved source and reduced carry fail closed', async () => {
    for (const [key, value] of Object.entries({
      PRODUCT_STUDIO_REVIEWED_PRICING_JSON: '',
      PRODUCT_STUDIO_APPROVED_SCOPE_JSON: '[]',
      PRODUCT_STUDIO_APPROVED_SOURCES_JSON: '[]',
      PRODUCT_STUDIO_PRIOR_COMMITMENT_USD: '0',
    })) {
      const x = setup();
      x.config.set(key, value);
      await expect(x.service.reserveImage(x.job as never)).rejects.toThrow();
      expect(x.usage.create).not.toHaveBeenCalled();
    }
  });
  it('settling an ambiguous image outcome retains positive committed/reserved cost and UNKNOWN, never a fabricated invoice', async () => {
    const old = {
      provider: 'fal',
      model: 'google/nano-banana-lite/edit',
      usageDetails: { pricing: 'TEST_ONLY' },
      reservedUsd: new Prisma.Decimal('.1'),
    };
    const update = jest
      .fn<Promise<void>, [{ where: { id: string }; data: Record<string, unknown> }]>()
      .mockResolvedValue(undefined);
    const db = { recognitionUsage: { findUniqueOrThrow: () => Promise.resolve(old), update } };
    await new RecognitionBudgetService(db as never, c()).settleImage(
      'entry',
      false,
      100,
      {},
      'FAL_STUDIO_OUTCOME_UNKNOWN',
    );
    expect(update.mock.calls[0][0].where).toEqual({ id: 'entry' });
    expect(update.mock.calls[0][0].data.status).toBe('UNKNOWN');
    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('committedUsd');
    expect(data).not.toHaveProperty('reservedUsd');
    expect(data).not.toHaveProperty('actualBilledUsd');
  });
});
