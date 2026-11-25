import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import {
  CATALOG_STUDIO_V1,
  studioHash,
  assertStudioApproved,
} from 'src/image-enhancement/brand-studio.config';
import { falStudioEdit, falStudioRequest } from 'src/image-enhancement/fal-studio.provider';
import { ImageEnhancementService } from 'src/image-enhancement/enhancement.service';
import { ImageProviderError } from 'src/image-enhancement/enhancement.provider';
import * as isolate from 'src/image-enhancement/enhancement-isolate';
import { readFalErrorDiagnostics } from 'src/image-enhancement/fal-error-diagnostics';
import { STUDIO_RECIPE } from 'src/image-enhancement/brand-studio.config';
import { createHash } from 'node:crypto';
import {
  assertFalStudioSource,
  FAL_STUDIO_RESERVATION,
} from 'src/image-enhancement/fal-studio.config';
const source = 'a'.repeat(64),
  mask = 'b'.repeat(64);
function config() {
  return new ConfigService({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:fake@127.0.0.1:55454/rezona_phase72_fal_12345678',
    GEMINI_BRAND_STUDIO_ENABLED: 'true',
    GEMINI_BRAND_STUDIO_PROVIDER: 'fal',
    FAL_BRAND_STUDIO_ENABLED: 'true',
    FAL_BRAND_STUDIO_LIVE_APPROVED: 'true',
    FAL_BRAND_STUDIO_PRIVATE_TRANSFER_APPROVED: 'true',
    FAL_BRAND_STUDIO_TERMS_REVIEWED: 'true',
    FAL_BRAND_STUDIO_REVIEWED_AT: new Date().toISOString(),
    FAL_BRAND_STUDIO_MODEL_REVISION: 'fal-schema-contract-only-v1',
    FAL_BRAND_STUDIO_PILOT_STYLE_HASH: studioHash(JSON.stringify(CATALOG_STUDIO_V1)),
    FAL_BRAND_STUDIO_INPUTS_JSON: JSON.stringify([{ sourceHash: source, maskHash: mask }]),
    FAL_BRAND_STUDIO_MONTHLY_BUDGET_USD: '10',
    FAL_BRAND_STUDIO_DAILY_BUDGET_USD: '0.50',
    FAL_BRAND_STUDIO_PILOT_BUDGET_USD: '0.40',
    FAL_BRAND_STUDIO_MAX_CONCURRENCY: '1',
    FAL_BRAND_STUDIO_MAX_REGENERATIONS: '1',
    FAL_KEY: 'fake-contract-key-never-transmitted',
    FAL_BRAND_STUDIO_QUOTED_UNIT_PRICE_USD: '1',
  });
}
describe('fal approved-mask pilot — contract stubs only, no paid transport', () => {
  const originalEnv = { ...process.env };
  const plate = () =>
    sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#F8F6F1' } })
      .png()
      .toBuffer();
  afterEach(() => {
    jest.restoreAllMocks();
    for (const k of new Set([...Object.keys(process.env), ...Object.keys(originalEnv)])) {
      if (
        k.startsWith('FAL_') ||
        k.startsWith('GEMINI_') ||
        k.startsWith('IMAGE_') ||
        k === 'DATABASE_URL' ||
        k === 'NODE_ENV'
      ) {
        if (originalEnv[k] === undefined) delete process.env[k];
        else process.env[k] = originalEnv[k];
      }
    }
  });
  it('allows only the exact primary model in isolated QA, retaining provisional style', () => {
    const s = assertStudioApproved(config());
    expect(s.model).toBe('google/nano-banana-lite/edit');
    expect(s.profile.approved).toBe(false);
    expect(s.reserve.toString()).toBe(FAL_STUDIO_RESERVATION);
    expect(s.reserve.toString()).toBe('0.17408');
  });
  it.each([
    'FAL_BRAND_STUDIO_LIVE_APPROVED',
    'FAL_BRAND_STUDIO_PRIVATE_TRANSFER_APPROVED',
    'FAL_BRAND_STUDIO_TERMS_REVIEWED',
    'FAL_KEY',
    'FAL_BRAND_STUDIO_PILOT_STYLE_HASH',
    'DATABASE_URL',
  ])(`missing %s blocks before network`, async (key) => {
    const c = config();
    c.set(key, '');
    const spy = jest.spyOn(global, 'fetch');
    await expect(falStudioEdit(c, await plate(), source)).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
  it.each([
    ['FAL_BRAND_STUDIO_MONTHLY_BUDGET_USD', '11'],
    ['FAL_BRAND_STUDIO_DAILY_BUDGET_USD', '0.51'],
    ['FAL_BRAND_STUDIO_PILOT_BUDGET_USD', '0.41'],
    ['FAL_BRAND_STUDIO_MAX_CONCURRENCY', '2'],
    ['FAL_BRAND_STUDIO_MAX_REGENERATIONS', '2'],
  ])('oversized %s refused', (k, v) => {
    const c = config();
    c.set(k, v);
    expect(() => assertStudioApproved(c)).toThrow();
  });
  it('unapproved source or mask cannot be dispatched', () => {
    expect(() => assertFalStudioSource(config(), source, mask)).not.toThrow();
    expect(() => assertFalStudioSource(config(), 'c'.repeat(64), mask)).toThrow();
    expect(() => assertFalStudioSource(config(), source, 'c'.repeat(64))).toThrow();
  });
  it('sends one inline reference, one generation, no unsupported resolution/tools/extra generations', async () => {
    const r = falStudioRequest(await plate(), CATALOG_STUDIO_V1);
    expect(r.num_images).toBe(1);
    expect(r.sync_mode).toBe(true);
    expect(r.limit_generations).toBe(true);
    expect(r.aspect_ratio).toBe('1:1');
    expect(Object.keys(r)).not.toContain('resolution');
    expect(r.image_urls).toHaveLength(1);
  });
  it('real adapter hits only fal primary, disables retries/fallback/storage and records reported units', async () => {
    const b = await plate(),
      spy = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ images: [{ url: 'data:image/png;base64,' + b.toString('base64') }] }),
          {
            headers: {
              'x-fal-request-id': '12345678-1234-1234-1234-123456789abc',
              'x-fal-billable-units': '0.0425',
            },
          },
        ),
      );
    const r = await falStudioEdit(config(), b, source);
    expect(r.requestId).toBe('12345678-1234-1234-1234-123456789abc');
    expect(r.billing.estimatedChargedUsd).toBe('0.0425');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('https://fal.run/google/nano-banana-lite/edit');
    const init = spy.mock.calls[0][1]!;
    expect(init.redirect).toBe('error');
    const h = init.headers as Record<string, string>;
    expect(h['X-Fal-No-Retry']).toBe('1');
    expect(h['x-app-fal-disable-fallback']).toBe('true');
    expect(h['X-Fal-Store-IO']).toBe('0');
    const policy = JSON.parse(h['X-Fal-Object-Lifecycle-Preference']) as {
      initial_acl: { default: string };
    };
    expect(policy.initial_acl.default).toBe('forbid');
  });
  it.each([403, 422, 429, 500])(
    'HTTP %s is never retried or logged with provider body',
    async (status) => {
      const spy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('Do not reflect any credentials in this body', { status }));
      await expect(falStudioEdit(config(), await plate(), source)).rejects.toMatchObject({
        possiblyBilled: true,
      });
      expect(spy).toHaveBeenCalledTimes(1);
    },
  );
  it('retains sanitized 422 type/location/request ID/latency without echoes or automatic retry', async () => {
    const secret = 'fake-sensitive-do-not-store',
      requestId = '12345678-1234-1234-1234-123456789abc';
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [
            {
              type: 'image_too_large',
              loc: ['body', 'image_urls', 0],
              msg: secret,
              input: 'data:image/png;base64,' + secret,
              url: 'https://untrusted.invalid/?key=' + secret,
              ctx: { max_width: 1024, unsafe: secret },
            },
          ],
        }),
        { status: 422, headers: { 'x-fal-request-id': requestId, 'x-fal-needs-retry': '1' } },
      ),
    );
    let caught: unknown;
    try {
      await falStudioEdit(config(), await plate(), source);
    } catch (e) {
      caught = e;
    }
    expect(caught).toMatchObject({
      code: 'FAL_STUDIO_HTTP_422',
      possiblyBilled: true,
      diagnostics: {
        requestId,
        httpStatus: 422,
        automaticRetry: false,
        providerSuggestedRetry: true,
        bodyState: 'JSON',
        errors: [
          {
            type: 'image_too_large',
            location: ['body', 'image_urls', 0],
            context: { max_width: 1024 },
          },
        ],
      },
    });
    expect(JSON.stringify(caught)).not.toContain(secret);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('does not fetch a provider CDN URL even if sync mode is ignored', async () => {
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ images: [{ url: 'https://v3b.fal.media/private.png' }] })),
      );
    await expect(falStudioEdit(config(), await plate(), source)).rejects.toThrow(
      'IMAGE_INLINE_RESULT_REQUIRED',
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('ambiguous timeout remains possibly billed', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(Error('network failure'));
    await expect(falStudioEdit(config(), await plate(), source)).rejects.toMatchObject({
      code: 'FAL_STUDIO_OUTCOME_UNKNOWN',
      possiblyBilled: true,
    });
  });
  it('worker persists safe failed-response identity/details and retains UNKNOWN without releasing or retrying', async () => {
    const c = config();
    c.set('IMAGE_ENHANCEMENT_ENABLED', 'true');
    c.set('IMAGE_ENHANCEMENT_LOCAL_ENABLED', 'true');
    const bytes = Buffer.from('offline-contract-source'),
      maskBytes = Buffer.from('offline-contract-mask');
    const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
    const sourceHash = hash(Buffer.concat([Buffer.from('image/png'), bytes])),
      maskHash = hash(maskBytes);
    c.set('FAL_BRAND_STUDIO_INPUTS_JSON', JSON.stringify([{ sourceHash, maskHash }]));
    const s = assertStudioApproved(c);
    const j = {
      id: 'job',
      provider: 'fal',
      mode: 'GEMINI_BRAND_STUDIO',
      sourceHash,
      model: s.model,
      modelRevision: s.revision,
      recipeVersion: STUDIO_RECIPE,
      promptVersion: s.profile.promptVersion,
      parameters: {
        styleHash: s.styleHash,
        maskHash,
        sourceCandidateId: 'local',
        sourceMediaRevision: 0,
      },
      image: { asset: { key: 'original' } },
      sessionId: 'draft',
      imageId: 'capture',
      attempts: 1,
    };
    const jobs = {
      findUnique: jest.fn().mockResolvedValue(j),
      findUniqueOrThrow: jest.fn().mockResolvedValue(j),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(1),
    };
    const db = {
      productImageEnhancementJob: jobs,
      $transaction: jest.fn(
        (fn: (tx: { productImageEnhancementJob: typeof jobs }) => Promise<unknown>) =>
          fn({ productImageEnhancementJob: jobs }),
      ),
    };
    const budget = {
      reserveImage: jest.fn().mockResolvedValue({ id: 'usage' }),
      settleImage: jest.fn(),
      releaseBeforeDispatch: jest.fn(),
    };
    const diagnostics = await readFalErrorDiagnostics(
      new Response(
        JSON.stringify({
          detail: [
            { type: 'string_too_short', loc: ['body', 'prompt'], input: 'private-not-retained' },
          ],
        }),
        { status: 422, headers: { 'x-fal-request-id': '12345678-1234-1234-1234-123456789abc' } },
      ),
      Date.now(),
    );
    const provider = {
      studio: jest
        .fn()
        .mockRejectedValue(new ImageProviderError('FAL_STUDIO_HTTP_422', true, diagnostics)),
    };
    const service = new ImageEnhancementService(
      db as never,
      c,
      {} as never,
      budget as never,
      provider as never,
      {} as never,
    );
    const seam = service as unknown as {
      authorized(id: string): Promise<boolean>;
      read(key: string): Promise<{ bytes: Buffer; mime: string }>;
      studioSource(...args: unknown[]): Promise<{ candidate: { maskAsset: { key: string } } }>;
    };
    jest.spyOn(seam, 'authorized').mockResolvedValue(true);
    jest.spyOn(seam, 'read').mockImplementation((key: string) =>
      Promise.resolve({
        bytes: key === 'original' ? bytes : maskBytes,
        mime: 'image/png',
      }),
    );
    jest
      .spyOn(seam, 'studioSource')
      .mockResolvedValue({ candidate: { maskAsset: { key: 'mask' } } });
    jest.spyOn(isolate, 'isolatedEnhancement').mockResolvedValue({
      png: bytes,
      providerInput: bytes,
      warnings: [],
      metrics: {},
      details: {},
    } as never);
    await service.process('job');
    expect(provider.studio).toHaveBeenCalledTimes(1);
    const updates = jobs.updateMany.mock.calls as unknown as [
      { data: { status: string; providerRequestId: string } },
    ][];
    const update = updates.at(-1)?.[0];
    expect(update?.data.status).toBe('UNKNOWN');
    expect(update?.data.providerRequestId).toBe(diagnostics.requestId);
    expect(budget.settleImage).toHaveBeenCalledWith(
      'usage',
      false,
      expect.any(Number),
      expect.objectContaining({ providerDiagnostics: diagnostics }),
      'FAL_STUDIO_HTTP_422',
    );
    expect(budget.releaseBeforeDispatch).not.toHaveBeenCalled();
    expect(JSON.stringify(budget.settleImage.mock.calls)).not.toContain('private-not-retained');
  });
});
