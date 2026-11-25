import { ConfigService } from '@nestjs/config';
import { GeminiRecognitionProvider, RecognitionProviderError } from 'src/ai/recognition.provider';
import { aiSettings, assertGeminiApproved } from 'src/ai/ai.config';
import {
  recognitionKey,
  responseSchema,
  taxonomyHash,
  validateRecognition,
} from 'src/ai/recognition.schema';
import { duplicateText, rankDuplicate, variantIdentity } from 'src/ai/duplicate-detection.service';
import { RecognitionBudgetService } from 'src/ai/recognition-budget.service';
import { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { recognitionImage } from 'src/ai/recognition-image';

const categories = [{ id: 'care', name: 'العناية' }];
const output = {
  name_ar: 'شامبو دوف 400 مل',
  name_en: 'Dove shampoo 400 ml',
  description_ar: 'شامبو في عبوة 400 مل',
  brand: 'Dove',
  product_type: 'shampoo',
  category_id: 'care',
  size_value: 400,
  size_unit: 'ml',
  color: null,
  model_number: null,
  manufacturer: null,
  barcode_text: null,
  visible_attributes: [],
  uncertain_fields: [],
  needs_review: false,
};
describe('Phase 6 strict recognition boundary', () => {
  it('accepts bounded observations with explicit employee review', () =>
    expect(validateRecognition(output, categories).warnings).toContain('EMPLOYEE_REVIEW_REQUIRED'));
  it.each([
    'price',
    'quantity',
    'warehouseId',
    'locationId',
    'SKU',
    'expiresAt',
    'authenticity',
    'confidence',
  ])('rejects invented %s', (key) => {
    expect(() => validateRecognition({ ...output, [key]: 100 }, categories)).toThrow(
      'AI_INVALID_SCHEMA',
    );
  });
  it.each([
    { category_id: 'not-allowed' },
    { name_ar: 'English only' },
    { size_unit: null },
    { name_ar: 'ا'.repeat(201) },
    { barcode_text: '123' },
    { visible_attributes: Array(13).fill({ name: 'x', value: 'y' }) },
  ])('rejects invalid category/Arabic/size/bounds %#', (patch) =>
    expect(() => validateRecognition({ ...output, ...patch }, categories)).toThrow(),
  );
  it('does not accept coercion or missing fields', () => {
    expect(() => validateRecognition({ ...output, needs_review: 'false' }, categories)).toThrow();
    expect(() => validateRecognition({ name_ar: 'منتج' }, categories)).toThrow();
  });
  it('unknown barcode is text only, never verified identity', () =>
    expect(
      validateRecognition({ ...output, barcode_text: '12345678' }, categories).warnings,
    ).toContain('BARCODE_VISIBLE_TEXT_ONLY_NOT_CATALOG_IDENTITY'));
  it('schema only permits supplied category identifiers', () =>
    expect(responseSchema(categories).properties.category_id.enum).toEqual(['care', null]));
  it('context key changes with source/model/provider/taxonomy/generation', () => {
    const hash = taxonomyHash(categories),
      base = recognitionKey('a', 'mock', 'model', hash);
    for (const args of [
      ['b', 'mock', 'model', hash],
      ['a', 'gemini', 'model', hash],
      ['a', 'mock', 'other', hash],
      ['a', 'mock', 'model', 'other'],
      ['a', 'mock', 'model', hash, 'retry1'],
    ])
      expect(recognitionKey(args[0], args[1], args[2], args[3], args[4])).not.toBe(base);
  });
  it('is disabled and budget-zero by default', () => {
    const s = aiSettings(new ConfigService());
    expect(s.enabled).toBe(false);
    expect(s.monthly.toString()).toBe('0');
    expect(() => assertGeminiApproved(new ConfigService())).toThrow('AI_LIVE_NOT_APPROVED');
  });
  it('disallows arbitrary model IDs and unsafe concurrency', () => {
    expect(() =>
      aiSettings(new ConfigService({ AI_RECOGNITION_MODEL: 'https://evil.test' })),
    ).toThrow();
    expect(() => aiSettings(new ConfigService({ AI_RECOGNITION_CONCURRENCY: '99' }))).toThrow();
  });
});

describe('Phase 6 provider transport — no live calls', () => {
  const config = () =>
    new ConfigService({
      AI_RECOGNITION_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'synthetic-test-key',
      AI_LIVE_CALLS_APPROVED: 'true',
      AI_PAID_DATA_TERMS_ACCEPTED: 'true',
      AI_ACCOUNT_MODEL_VERIFIED: 'gemini-3.1-flash-lite',
      AI_MODEL_REVISION: 'gemini-3.1-flash-lite-test',
      AI_PROVIDER_REVIEWED_AT: new Date().toISOString(),
      AI_MONTHLY_BUDGET_USD: '0.50',
      AI_DAILY_BUDGET_USD: '0.50',
      AI_INPUT_USD_PER_MILLION: '0.25',
      AI_OUTPUT_USD_PER_MILLION: '1.50',
    });
  const input = { jpeg: Buffer.from('synthetic-no-image'), sourceHash: 'hash', categories };
  afterEach(() => jest.restoreAllMocks());
  it('fails closed before transport without live authorization', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    await expect(
      new GeminiRecognitionProvider(new ConfigService()).recognize(input),
    ).rejects.toThrow('AI_LIVE_NOT_APPROVED');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends only fixed-origin inline image and strict JSON schema, using header credentials', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          modelVersion: 'gemini-3.1-flash-lite-test',
          candidates: [
            { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } },
          ],
          usageMetadata: {
            promptTokenCount: 1024,
            candidatesTokenCount: 200,
            thoughtsTokenCount: 0,
          },
        }),
      ),
    );
    const result = await new GeminiRecognitionProvider(config()).recognize(input);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
    );
    expect(options?.redirect).toBe('error');
    const body = JSON.parse(options?.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.tools).toBeUndefined();
    expect(result.inputTokens).toBe(1024);
    expect(result.value).toEqual(output);
  });
  it.each([400, 401, 403, 429, 500, 503])(
    'normalizes HTTP %i without response/key logging or automatic retry',
    async (code) => {
      const fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('private error', { status: code }));
      await expect(new GeminiRecognitionProvider(config()).recognize(input)).rejects.toBeInstanceOf(
        RecognitionProviderError,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { candidates: [] },
    { promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] },
    {
      candidates: [
        { finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'writeStock' } }] } },
      ],
    },
  ])('rejects empty/blocked/truncated/tool responses %#', async (body) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(new GeminiRecognitionProvider(config()).recognize(input)).rejects.toBeInstanceOf(
      RecognitionProviderError,
    );
  });
  it('retains ambiguity on transport loss', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('disconnect'));
    await expect(new GeminiRecognitionProvider(config()).recognize(input)).rejects.toMatchObject({
      possiblyBilled: true,
    });
  });
});

describe('Phase 6 authorized recognition-ready image', () => {
  const key = 'products/intake-' + 'a'.repeat(64) + '.jpg';
  it('uses a sharp 1600px recognition image, auto-orients and strips metadata rather than a catalog thumbnail', async () => {
    const source = await sharp({
      create: { width: 1800, height: 1200, channels: 3, background: '#ddaa88' },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const hash = createHash('sha256').update('image/jpeg').update(source).digest('hex');
    const storage = {
      getObject: jest
        .fn()
        .mockResolvedValue({ size: source.length, stream: Readable.from([source]) }),
    };
    const result = await recognitionImage(storage as any, key, 'image/jpeg', hash),
      info = await sharp(result).metadata();
    expect(Math.max(info.width!, info.height!)).toBe(1600);
    expect(info.height).toBeGreaterThan(info.width!);
    expect(info.exif).toBeUndefined();
    expect(info.orientation).toBeUndefined();
    expect(storage.getObject).toHaveBeenCalledWith(key);
  });
  it('rejects external or arbitrary storage keys without reading a source', async () => {
    const storage = { getObject: jest.fn() };
    await expect(
      recognitionImage(storage as any, 'https://evil.test/a.jpg', 'image/jpeg', 'x'),
    ).rejects.toThrow('AI_PRIVATE_SOURCE_REQUIRED');
    expect(storage.getObject).not.toHaveBeenCalled();
  });
  it('rejects a changed object fingerprint before sending image bytes anywhere', async () => {
    const source = Buffer.from('changed');
    const storage = {
      getObject: jest
        .fn()
        .mockResolvedValue({ size: source.length, stream: Readable.from([source]) }),
    };
    await expect(recognitionImage(storage as any, key, 'image/jpeg', 'wrong')).rejects.toThrow(
      'AI_IMAGE_HASH_MISMATCH',
    );
  });
});

describe('Phase 6 budgets: deterministic precise reservations', () => {
  const config = new ConfigService({
    AI_DAILY_REQUEST_LIMIT: '10',
    AI_EMPLOYEE_DAILY_LIMIT: '10',
    AI_MODEL_DAILY_LIMIT: '10',
  });
  const task = {
    id: 'task',
    actorId: 'actor',
    provider: 'mock',
    model: 'gemini-3.1-flash-lite',
    attempts: 1,
  } as any;
  function fixture(count = 0) {
    const tx = {
      $queryRaw: jest.fn(),
      recognitionUsage: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(count),
        aggregate: jest.fn().mockResolvedValue({ _sum: { committedUsd: new Prisma.Decimal(0) } }),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'usage', ...data })),
      },
    };
    const db = { $transaction: async (fn: any) => fn(tx) };
    return { tx, service: new RecognitionBudgetService(db as any, config) };
  }
  it('reserves before dispatch with a transaction-wide budget lock', async () => {
    const { tx, service } = fixture();
    const row = await service.reserve(task);
    expect(row.reservedUsd.toString()).toBe('0');
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.recognitionUsage.create).toHaveBeenCalledTimes(1);
  });
  it('enforces per-day/per-employee/model/hour/concurrency limits', async () => {
    const { tx, service } = fixture(10);
    await expect(service.reserve(task)).rejects.toThrow('AI_QUOTA_EXCEEDED');
    expect(tx.recognitionUsage.create).not.toHaveBeenCalled();
  });
  it('cannot reserve Gemini without explicit approvals even if code is called directly', async () => {
    const { service } = fixture();
    await expect(service.reserve({ ...task, provider: 'gemini' })).rejects.toThrow(
      'AI_LIVE_NOT_APPROVED',
    );
  });
});

describe('Phase 6 matching corpus — 50 synthetic TEXT pairs, NOT photo/live AI accuracy', () => {
  const brands = ['دوف', 'نيفيا', 'بانتين', 'سوني', 'سامسونج'];
  const pairs = brands.flatMap(
    (brand) =>
      [
        [`${brand} شامبو ٤٠٠ مل`, `${brand} شامبو 400 ml`, true],
        [`${brand} شامبو 400 ml`, `${brand} شامبو 500 ml`, false],
        [`${brand} شامبو 1 l`, `${brand} شامبو 1000 ml`, true],
        [`${brand} شامبو 400 ml`, `${brand} شامبو`, false],
        [`${brand} جهاز X100 128gb اسود`, `${brand} جهاز X100 256gb اسود`, false],
        [`${brand} جهاز X100 128gb اسود`, `${brand} جهاز X100 128gb ابيض`, false],
        [`${brand} جهاز X100 128gb اسود`, `${brand} جهاز X200 128gb اسود`, false],
        [`${brand} جهاز X100 128gb اسود`, `${brand} جهاز X100 128gb black`, true],
        [`${brand} شامبو 400 ml pack 2`, `${brand} شامبو 400 ml pack 4`, false],
        [`${brand} شامبو 400 ml`, `${brand} شامبو 400 ml`, true],
      ] as [string, string, boolean][],
  );
  it.each(pairs)('%s versus %s (compatible=%s)', (a, b, compatible) => {
    const result = rankDuplicate(a, b);
    if (compatible) {
      expect(result.conflicts).toHaveLength(0);
      expect(result.score).toBeGreaterThan(0);
      expect(result.strong).toBe(true);
    } else {
      expect(result.strong).toBe(false);
      expect(result.conflicts.length > 0 || result.reasons.includes('SIZE_UNKNOWN_NOT_EXACT')).toBe(
        true,
      );
    }
  });
  it('normalizes Arabic variants/digits and equivalent dimensions', () => {
    expect(duplicateText('إِختبار ٤٠٠')).toBe('اختبار 400');
    expect(variantIdentity('دوف 0.4 l').sizes).toEqual(variantIdentity('دوف 400 مل').sizes);
  });
  it('same memory cannot hide a conflicting volume, and same model/size cannot override a different brand', () => {
    expect(rankDuplicate('دوف X100 128gb 400 ml', 'دوف X100 128gb 500 ml').conflicts).toContain(
      'SIZES_CONFLICT',
    );
    expect(rankDuplicate('دوف X100 128gb', 'نيفيا X100 128gb').strong).toBe(false);
  });
});
