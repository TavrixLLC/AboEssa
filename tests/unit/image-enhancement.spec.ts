import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { enhanceCodec } from 'src/image-enhancement/enhancement-codec';
import {
  enhancementSettings,
  assertEditingApproved,
  ENHANCEMENT_RECIPE,
} from 'src/image-enhancement/enhancement.config';
import { ImageEditingProvider, inlineImage } from 'src/image-enhancement/enhancement.provider';
import { selectedIntakeAsset } from 'src/image-enhancement/enhancement-selection';
const svg =
  '<svg width="640" height="480"><rect x="190" y="50" width="260" height="380" fill="#184634"/><text x="200" y="200" fill="white" font-size="30">QA 400ml</text></svg>';
const photo = () => sharp(Buffer.from(svg)).png().toBuffer();
describe('Phase 7 conservative private image preparation', () => {
  it('all optional features and all live editing default off', () => {
    const c = new ConfigService();
    const s = enhancementSettings(c);
    expect(s.enabled).toBe(false);
    expect(s.ai).toBe(false);
    expect(s.monthly.toString()).toBe('0');
    expect(ENHANCEMENT_RECIPE).toBe('clean-v1');
  });
  it('credentials alone never authorize external processing', () => {
    expect(() =>
      assertEditingApproved(
        new ConfigService({ IMAGE_AI_PROVIDER: 'fal', FAL_KEY: 'fake-not-sent' }),
      ),
    ).toThrow('IMAGE_LIVE_NOT_APPROVED');
  });
  it.each([
    'http://127.0.0.1/internal',
    'https://169.254.169.254/meta',
    'https://fal.media/anything.png',
    'file:///etc/passwd',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,AA===',
  ])('no arbitrary URL retrieval / invalid inline image: %s', (value) => {
    expect(() => inlineImage(value)).toThrow();
  });
  it('CLEAN retains source aspect and product pixels, strips metadata and adds neutral square without upscaling', async () => {
    const bytes = await photo(),
      out = await enhanceCodec({
        bytes,
        mime: 'image/png',
        mode: 'CLEAN',
        background: 'WHITE',
        matting: false,
      });
    const meta = await sharp(out.png).metadata();
    expect([meta.width, meta.height]).toEqual([1024, 1024]);
    expect(meta.exif).toBeUndefined();
    const raw = await sharp(out.png).removeAlpha().raw().toBuffer();
    const p = (512 * 1024 + 512) * 3;
    expect([...raw.subarray(p, p + 3)]).toEqual([24, 70, 52]);
    expect(out.metrics.maskKind).toBe('NONE');
    expect(out.warnings).toContain('HUMAN_REVIEW_REQUIRED');
  });
  it('uses original alpha and preserves all disconnected captured pieces', async () => {
    const bytes = await photo(),
      out = await enhanceCodec({
        bytes,
        mime: 'image/png',
        mode: 'BACKGROUND_REMOVE',
        background: 'WHITE',
        matting: false,
      });
    expect(out.foreground).toBeDefined();
    expect(out.metrics.maskKind).toBe('SOURCE_ALPHA');
    expect(out.warnings).toContain('ALPHA_EDGES_REQUIRE_REVIEW');
  });
  it('rejects complex opaque scenes for background removal and AI before dispatch', async () => {
    const bytes = await sharp(await photo())
      .flatten({ background: '#705a33' })
      .jpeg()
      .toBuffer();
    await expect(
      enhanceCodec({
        bytes,
        mime: 'image/jpeg',
        mode: 'AI_ENHANCE',
        background: 'WHITE',
        matting: true,
      }),
    ).rejects.toThrow('MASK_UNSAFE_KEEP_ORIGINAL');
  });
  it('conservative white border matte works, but blank/white-on-white fails closed', async () => {
    const bytes = await sharp(await photo())
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer();
    const out = await enhanceCodec({
      bytes,
      mime: 'image/png',
      mode: 'STUDIO_COMPOSITE',
      background: 'LIGHT_GRAY',
      matting: true,
    });
    expect(out.metrics.maskKind).toBe('CONSERVATIVE_WHITE_BORDER');
    const blank = await sharp({
      create: { width: 600, height: 400, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    await expect(
      enhanceCodec({
        bytes: blank,
        mime: 'image/png',
        mode: 'BACKGROUND_REMOVE',
        background: 'WHITE',
        matting: true,
      }),
    ).rejects.toThrow('MASK_UNSAFE_KEEP_ORIGINAL');
    await expect(
      enhanceCodec({
        bytes: blank,
        mime: 'image/png',
        mode: 'CLEAN',
        background: 'WHITE',
        matting: false,
      }),
    ).rejects.toThrow('IMAGE_EMPTY_KEEP_ORIGINAL');
  });
  it('does not adopt generated product pixels; neutral background recomposition is exact and nonneutral hallucinations are rejected', async () => {
    const bytes = await photo(),
      generated = await sharp({
        create: { width: 1024, height: 1024, channels: 3, background: '#fafafa' },
      })
        .png()
        .toBuffer();
    const out = await enhanceCodec({
      bytes,
      mime: 'image/png',
      mode: 'AI_ENHANCE',
      background: 'WHITE',
      matting: false,
      generated,
    });
    const raw = await sharp(out.png).removeAlpha().raw().toBuffer(),
      p = (512 * 1024 + 512) * 3;
    expect([...raw.subarray(p, p + 3)]).toEqual([24, 70, 52]);
    const unsafe = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: '#cc1222' },
    })
      .png()
      .toBuffer();
    await expect(
      enhanceCodec({
        bytes,
        mime: 'image/png',
        mode: 'AI_ENHANCE',
        background: 'WHITE',
        matting: false,
        generated: unsafe,
      }),
    ).rejects.toThrow('GENERATED_BACKGROUND_UNSAFE_KEEP_ORIGINAL');
  });
  it.each([Buffer.from('<svg width="100" height="100"/>'), Buffer.from('not an image')])(
    'rejects unsupported/malformed input',
    async (bytes) => {
      await expect(
        enhanceCodec({
          bytes,
          mime: 'image/png',
          mode: 'CLEAN',
          background: 'WHITE',
          matting: false,
        }),
      ).rejects.toThrow();
    },
  );
  it('does not change old/manual selection or require network in the stock transaction', async () => {
    const tx = {
        productImageEnhancementDecision: { findFirst: jest.fn().mockResolvedValue(null) },
      },
      original = { id: 'source', url: '/original' };
    expect(await selectedIntakeAsset(tx as any, { id: 's' } as any, 'i', original)).toBe(original);
  });
  it('rejects a selected candidate from another draft inside the commit resolver', async () => {
    const tx = {
      productImageEnhancementDecision: {
        findFirst: jest.fn().mockResolvedValue({
          selectedCandidateId: 'c',
          selectedCandidate: { job: { sessionId: 'wrong' } },
        }),
      },
    };
    await expect(
      selectedIntakeAsset(tx as any, { id: 's' } as any, 'i', { id: 'source', url: '/original' }),
    ).rejects.toThrow();
  });
});
describe('fal adapter contract with stubbed fetch ONLY', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });
  it('pins origin/model, disables retries/fallback/prompt expansion, uses inline IO and never exposes a draft URL', async () => {
    const c = new ConfigService({
      IMAGE_AI_PROVIDER: 'fal',
      IMAGE_AI_ENABLED: 'true',
      IMAGE_AI_LIVE_APPROVED: 'true',
      IMAGE_AI_DATA_TERMS_ACCEPTED: 'true',
      IMAGE_AI_ACCOUNT_MODEL_VERIFIED: 'blackforestlabs/flux-3/klein/edit-image',
      IMAGE_AI_MODEL_REVISION: 'reviewed-test-revision',
      IMAGE_AI_PROVIDER_REVIEWED_AT: new Date().toISOString(),
      IMAGE_AI_MONTHLY_BUDGET_USD: '1',
      IMAGE_AI_DAILY_BUDGET_USD: '1',
      IMAGE_AI_MAX_REQUEST_USD: '0.02',
      FAL_KEY: 'fake-never-transmitted',
    });
    const output = await photo(),
      stub = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            images: [{ url: 'data:image/png;base64,' + output.toString('base64') }],
          }),
          { status: 200 },
        ),
      );
    global.fetch = stub;
    const r = await new ImageEditingProvider(c).edit(
      Buffer.from('fake-prepared-jpeg'),
      'a'.repeat(64),
    );
    expect(r.bytes).toEqual(output);
    expect(stub).toHaveBeenCalledTimes(1);
    const [url, options] = stub.mock.calls[0];
    expect(url).toBe('https://fal.run/blackforestlabs/flux-3/klein/edit-image');
    expect(options.redirect).toBe('error');
    expect(options.headers['X-Fal-No-Retry']).toBe('1');
    expect(options.headers['x-app-fal-disable-fallback']).toBe('true');
    expect(options.headers['X-Fal-Store-IO']).toBe('0');
    const body = JSON.parse(options.body);
    expect(body.enable_prompt_expansion).toBe(false);
    expect(body.num_images).toBe(1);
    expect(body.sync_mode).toBe(true);
    expect(body.image_urls[0]).toMatch(/^data:image\/jpeg;base64,/);
  });
});
