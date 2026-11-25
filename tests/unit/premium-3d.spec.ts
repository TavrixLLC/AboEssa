import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { premium3dCodec } from 'src/image-enhancement/premium-3d-codec';
import {
  PREMIUM_3D_STYLE,
  PREMIUM_3D_MODE,
  PREMIUM_3D_PROFILE,
  PREMIUM_3D_PROMPT,
  requirePremium3dReview,
} from 'src/image-enhancement/premium-3d.config';
import { falStudioRequest } from 'src/image-enhancement/fal-studio.provider';
import { studioSettings, TABLETOP_STYLES } from 'src/image-enhancement/brand-studio.config';
import { falStudioLimits } from 'src/image-enhancement/fal-studio.config';
import { ImageEnhancementService } from 'src/image-enhancement/enhancement.service';

describe('explicit full-product premium 3D mode, no network', () => {
  jest.setTimeout(30000);
  const base = {
    GEMINI_BRAND_STUDIO_ENABLED: 'true',
    GEMINI_BRAND_STUDIO_PROVIDER: 'mock',
    FAL_PREMIUM_3D_ENABLED: 'true',
    IMAGE_ENHANCEMENT_ENABLED: 'true',
    IMAGE_ENHANCEMENT_LOCAL_ENABLED: 'true',
  };
  const limits = {
    FAL_PREMIUM_3D_PILOT_APPROVED: 'true',
    FAL_PREMIUM_3D_APPROVAL_ID: 'REZONA_3D_BLACK_GOLD_ONE_20261123',
    FAL_PREMIUM_3D_PRIOR_COMMITMENT_USD: '0.870400',
    FAL_PREMIUM_3D_APPROVED_STYLE_HASH: 'a'.repeat(64),
    FAL_BRAND_STUDIO_MAX_REGENERATIONS: '0',
    FAL_BRAND_STUDIO_MONTHLY_BUDGET_USD: '10',
    FAL_BRAND_STUDIO_DAILY_BUDGET_USD: '1.50',
    FAL_BRAND_STUDIO_PILOT_BUDGET_USD: '0.20',
  };
  const fixture = async () => {
    const bytes = await sharp(
      Buffer.from(
        '<svg width="300" height="300"><rect x="90" y="70" width="120" height="150" fill="white"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    return {
      bytes,
      mask: await sharp(bytes).extractChannel('alpha').png().toBuffer(),
      mime: 'image/png',
      mode: PREMIUM_3D_MODE,
      matting: false,
      background: 'WHITE',
      studioProfile: PREMIUM_3D_PROFILE,
    };
  };
  const render = () =>
    sharp(
      Buffer.from(
        '<svg width="1024" height="1024"><rect width="1024" height="1024" fill="#101112"/><rect x="40" y="820" width="944" height="100" fill="#CAAB62"/><rect x="400" y="280" width="220" height="500" fill="#D24536"/></svg>',
      ),
    )
      .png()
      .toBuffer();
  it('has separate fixed identity and affirmative product render prompt, not empty-plate instructions', () => {
    expect(TABLETOP_STYLES).toHaveLength(3);
    expect(studioSettings(new ConfigService(base), PREMIUM_3D_STYLE).profile.renderPolicy).toBe(
      'GENERATIVE_PRODUCT_3D',
    );
    expect(studioSettings(new ConfigService(), PREMIUM_3D_STYLE).enabled).toBe(false);
    const r = falStudioRequest(Buffer.from('fake-image'), PREMIUM_3D_PROFILE);
    expect(r.prompt).toBe(PREMIUM_3D_PROMPT);
    expect(r.prompt).toContain('not a cutout');
    expect(r.prompt).toContain('black');
    expect(r.prompt).toContain('gold');
    expect(r.prompt).toContain('pedestal');
    expect(r.prompt).not.toContain('EMPTY');
    expect(r.num_images).toBe(1);
    expect(r.limit_generations).toBe(true);
  });
  it('one request, conservative carried commitments, zero regeneration, no scope expansion', () => {
    const l = falStudioLimits(new ConfigService(limits));
    expect(l.maxRequests).toBe(1);
    expect(l.reserve.toString()).toBe('0.17408');
    expect(l.carryCommitment.add(l.reserve).toString()).toBe('1.04448');
    for (const override of [
      { FAL_BRAND_STUDIO_PILOT_BUDGET_USD: '0.21' },
      { FAL_BRAND_STUDIO_DAILY_BUDGET_USD: '1.51' },
      { FAL_BRAND_STUDIO_MONTHLY_BUDGET_USD: '10.01' },
      { FAL_BRAND_STUDIO_MAX_REGENERATIONS: '1' },
      { FAL_PREMIUM_3D_PRIOR_COMMITMENT_USD: '0' },
      { FAL_TABLETOP_PILOT_APPROVED: 'true' },
    ])
      expect(() => falStudioLimits(new ConfigService({ ...limits, ...override }))).toThrow();
  });
  it('final generated foreground stays GENERATED, never overlaid with the original cutout', async () => {
    const input = await fixture(),
      generated = await render(),
      out = await premium3dCodec({ ...input, generated });
    const actual = await sharp(out.png).ensureAlpha().raw().toBuffer(),
      expected = await sharp(generated).ensureAlpha().raw().toBuffer();
    expect(actual.equals(expected)).toBe(true);
    expect(out.foreground).toBeUndefined();
    expect(out.details?.opaqueRgbPreserved).toBe(false);
    expect(out.warnings).toContain('GENERATIVE_PRODUCT_NOT_CAPTURED_PIXELS');
    expect(out.details?.sourceMaskHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await sharp(out.png).metadata()).exif).toBeUndefined();
  });
  it('reference-only preparation is never mislabeled a 3D result', async () => {
    const out = await premium3dCodec(await fixture());
    expect(out.providerInput).toBeDefined();
    expect(out.warnings).toEqual(['PREMIUM_3D_REFERENCE_ONLY_NOT_RESULT']);
    expect(out.details?.renderPolicy).toBe('REFERENCE_ONLY');
  });
  it('missing black/gold or invalid dimensions reject without inventing an image or retrying', async () => {
    const f = await fixture();
    for (const size of [64, 1024]) {
      const generated = await sharp({
        create: { width: size, height: size, channels: 3, background: 'white' },
      })
        .png()
        .toBuffer();
      await expect(premium3dCodec({ ...f, generated })).rejects.toThrow();
    }
  });
  it.each([
    'sceneReviewed',
    'meaningfulImprovement',
    'identityReviewed',
    'premiumSceneReviewed',
    'generativeNatureAcknowledged',
  ])('requires every strict human check: %s', (key) => {
    const yes = {
      sceneReviewed: true,
      meaningfulImprovement: true,
      identityReviewed: true,
      premiumSceneReviewed: true,
      generativeNatureAcknowledged: true,
    };
    expect(() => requirePremium3dReview(yes)).not.toThrow();
    expect(() => requirePremium3dReview({ ...yes, [key]: false })).toThrow(
      'PREMIUM_3D_STRICT_REVIEW_REQUIRED',
    );
  });
  it('wrong mode/style, absent generative consent and regeneration fail before reservation/DB', async () => {
    const db = { $transaction: jest.fn() },
      budget = { reserveImage: jest.fn() },
      provider = { studio: jest.fn() };
    const s = new ImageEnhancementService(
      db as never,
      new ConfigService(base),
      {} as never,
      budget as never,
      provider as never,
      {} as never,
    );
    const req = {
      clientImageId: 'capture',
      requestKey: 'explicit',
      mode: PREMIUM_3D_MODE as 'PREMIUM_3D_STUDIO',
      stylePreset: PREMIUM_3D_STYLE,
    };
    for (const r of [
      req,
      { ...req, mode: 'GEMINI_BRAND_STUDIO' as const },
      { ...req, generation: 1, generativeProductApproved: true },
    ])
      await expect(s.start('draft', r, { isOwner: true } as never)).rejects.toMatchObject({
        status: 400,
      });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(budget.reserveImage).not.toHaveBeenCalled();
    expect(provider.studio).not.toHaveBeenCalled();
  });
});
