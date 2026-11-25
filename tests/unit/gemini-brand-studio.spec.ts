import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import {
  assertStudioApproved,
  CATALOG_STUDIO_V1,
  studioSettings,
  STUDIO_RESERVATION_USD,
} from 'src/image-enhancement/brand-studio.config';
import { studioCodec, validateStudioPlate } from 'src/image-enhancement/brand-studio-codec';
import {
  parseStudioResponse,
  studioRequest,
  geminiStudioEdit,
} from 'src/image-enhancement/gemini-studio.provider';
import { ImageEditingProvider } from 'src/image-enhancement/enhancement.provider';

describe('Phase7.2 no-network Gemini studio contract', () => {
  const p = CATALOG_STUDIO_V1;
  const plate = () =>
    sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#F8F6F1' } })
      .png()
      .toBuffer();
  const liveConfig = () =>
    new ConfigService({
      GEMINI_BRAND_STUDIO_ENABLED: 'true',
      GEMINI_BRAND_STUDIO_PROVIDER: 'gemini',
      GEMINI_BRAND_STUDIO_LIVE_APPROVED: 'true',
      GEMINI_BRAND_STUDIO_PRIVATE_TRANSFER_APPROVED: 'true',
      GEMINI_BRAND_STUDIO_PAID_TERMS_ACCEPTED: 'true',
      GEMINI_BRAND_STUDIO_ACCOUNT_MODEL_VERIFIED: 'gemini-3.1-flash-lite-image',
      GEMINI_BRAND_STUDIO_REVIEWED_AT: new Date().toISOString(),
      GEMINI_BRAND_STUDIO_MODEL_REVISION: 'contract-stub-v1',
      GEMINI_BRAND_STUDIO_MONTHLY_BUDGET_USD: '1',
      GEMINI_BRAND_STUDIO_PILOT_BUDGET_USD: '.50'.replace(/^\./, '0.'),
      GEMINI_BRAND_STUDIO_PROFILE_JSON: JSON.stringify({ ...p, approved: true }),
      GEMINI_API_KEY: 'fake-nonworking-transport-stub-only',
    });
  it('defaults off, zero, provisional; real theme gold not legacy blue', () => {
    const s = studioSettings(new ConfigService());
    expect(s.enabled).toBe(false);
    expect(s.monthly.toString()).toBe('0');
    expect(s.profile.accentPalette).toEqual(['#F4C46C', '#E7BC61']);
    expect(s.profile.approved).toBe(false);
    expect(() => assertStudioApproved(new ConfigService())).toThrow('STUDIO_DISABLED');
    expect(STUDIO_RESERVATION_USD).toBe('0.139264');
  });
  it.each([
    'GEMINI_BRAND_STUDIO_LIVE_APPROVED',
    'GEMINI_BRAND_STUDIO_PRIVATE_TRANSFER_APPROVED',
    'GEMINI_BRAND_STUDIO_PAID_TERMS_ACCEPTED',
    'GEMINI_BRAND_STUDIO_ACCOUNT_MODEL_VERIFIED',
    'GEMINI_BRAND_STUDIO_REVIEWED_AT',
    'GEMINI_BRAND_STUDIO_PILOT_BUDGET_USD',
  ])(`missing %s fails before fetch`, async (key) => {
    const c = liveConfig();
    c.set(key, '0');
    const spy = jest.spyOn(global, 'fetch').mockRejectedValue(Error('must not reach transport'));
    try {
      await expect(geminiStudioEdit(c, await plate(), p)).rejects.toThrow();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it('never switches models or accepts another shape', () => {
    expect(() =>
      studioSettings(new ConfigService({ GEMINI_BRAND_STUDIO_MODEL: 'gemini-nano-banana-2.1' })),
    ).toThrow();
    expect(() =>
      studioSettings(
        new ConfigService({
          GEMINI_BRAND_STUDIO_PROFILE_JSON: JSON.stringify({ ...p, width: 2048 }),
        }),
      ),
    ).toThrow();
  });
  it('request is inline, square, tools-free, no metadata/business data', async () => {
    const r = studioRequest(await plate(), p);
    expect(r.generationConfig.imageConfig).toEqual({ aspectRatio: '1:1', imageSize: '1K' });
    expect(Object.keys(r)).toEqual(['contents', 'generationConfig']);
    expect(JSON.stringify(r)).not.toMatch(/price|warehouseId|customerId|apiKey/);
    expect(r.contents[0].parts[1].inlineData?.mimeType).toBe('image/png');
  });
  it('real REST adapter is exercised with a stub, fixed host, header key, no retry', async () => {
    const bytes = await plate();
    const stub = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [{ inlineData: { mimeType: 'image/png', data: bytes.toString('base64') } }],
              },
            },
          ],
          responseId: 'stub-response',
          modelVersion: 'reviewed-stub',
          usageMetadata: {
            promptTokenCount: 1200,
            candidatesTokenCount: 1120,
            thoughtsTokenCount: 0,
            candidatesTokensDetails: [
              { modality: 'IMAGE', tokenCount: 1120 },
              { modality: 'TEXT', tokenCount: 0 },
            ],
          },
        }),
      ),
    );
    try {
      const out = await geminiStudioEdit(liveConfig(), bytes, p);
      expect(out.bytes).toEqual(bytes);
      expect(out.usage?.imageOutputTokens).toBe(1120);
      expect(stub).toHaveBeenCalledTimes(1);
      expect(stub.mock.calls[0][0]).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent',
      );
      expect(stub.mock.calls[0][1]?.redirect).toBe('error');
    } finally {
      stub.mockRestore();
    }
  });
  it.each([429, 500, 403])('HTTP %s never retries a possibly billed dispatch', async (status) => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status }));
    try {
      await expect(geminiStudioEdit(liveConfig(), await plate(), p)).rejects.toMatchObject({
        possiblyBilled: true,
      });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
  it('timeout/connection ambiguity remains possibly billed', async () => {
    const spy = jest.spyOn(global, 'fetch').mockRejectedValue(Error('network disconnected'));
    try {
      await expect(geminiStudioEdit(liveConfig(), await plate(), p)).rejects.toMatchObject({
        code: 'STUDIO_OUTCOME_UNKNOWN',
        possiblyBilled: true,
      });
    } finally {
      spy.mockRestore();
    }
  });
  it.each([
    { candidates: [] },
    { candidates: [{ finishReason: 'SAFETY' }] },
    {
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ fileData: { fileUri: 'http://localhost/private' } }] },
        },
      ],
    },
    {
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ inlineData: { mimeType: 'image/svg+xml', data: 'AAAA' } }] },
        },
      ],
    },
  ])('rejects unsafe output without fetching a URL', async (body) => {
    await expect(parseStudioResponse(body)).rejects.toThrow();
  });
  it('mock explicitly produces only a deterministic plate; makes no fetch', async () => {
    const spy = jest.spyOn(global, 'fetch');
    try {
      const provider = new ImageEditingProvider(
        new ConfigService({ GEMINI_BRAND_STUDIO_ENABLED: 'true' }),
      );
      const out = await provider.studio(await plate(), 'hash');
      expect(out.reported).toBe(true);
      expect(out.usage).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it('source pixels, text and disconnected accessories preserved, metadata stripped', async () => {
    const bytes = await sharp(
      Buffer.from(
        '<svg width="400" height="400"><rect x="50" y="50" width="250" height="280" fill="#145142"/><rect x="330" y="200" width="20" height="40" fill="#aa3333"/><text x="70" y="160" fill="white" font-size="25">REAL QA</text></svg>',
      ),
    )
      .png()
      .toBuffer();
    const raw = await sharp(bytes).ensureAlpha().raw().toBuffer(),
      mask = await sharp(bytes).extractChannel('alpha').png().toBuffer();
    const out = await studioCodec({
      bytes,
      mask,
      mime: 'image/png',
      mode: 'GEMINI_BRAND_STUDIO',
      background: 'WHITE',
      matting: false,
      studioProfile: p,
      generated: await plate(),
    });
    const fg = await sharp(out.foreground).raw().toBuffer();
    // No upscaling; crop begins (50,50), center offset is (362,372). Verify every opaque captured pixel.
    let mismatches = 0,
      checked = 0;
    for (let y = 50; y < 330; y++)
      for (let x = 50; x < 350; x++)
        if (raw[(y * 400 + x) * 4 + 3] === 255) {
          const a = (y * 400 + x) * 4,
            b = ((y - 50 + 372) * 1024 + x - 50 + 362) * 4;
          checked++;
          if (!fg.subarray(b, b + 3).equals(raw.subarray(a, a + 3))) mismatches++;
        }
    expect(checked).toBeGreaterThan(60000);
    expect(mismatches).toBe(0);
    expect((await sharp(out.png).metadata()).exif).toBeUndefined();
    expect(out.details?.maskHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('wrong mask alignment, empty mask and product ghosts (even central) fail closed', async () => {
    const ghost = await sharp(await plate())
      .composite([
        {
          input: Buffer.from(
            '<svg width="1024" height="1024"><rect x="490" y="490" width="30" height="50" fill="#555555"/></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();
    await expect(validateStudioPlate(ghost, p)).rejects.toThrow('STUDIO_PLATE_GHOST');
    await expect(
      studioCodec({
        bytes: await plate(),
        mask: await sharp({ create: { width: 10, height: 10, channels: 3, background: 'black' } })
          .png()
          .toBuffer(),
        mime: 'image/png',
        mode: 'GEMINI_BRAND_STUDIO',
        background: 'WHITE',
        matting: false,
        studioProfile: p,
      }),
    ).rejects.toThrow('STUDIO_MASK_ALIGNMENT');
  });
});
