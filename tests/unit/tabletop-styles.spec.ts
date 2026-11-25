import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import {
  TABLETOP_STYLES,
  TABLETOP_STYLES_V1,
  CATALOG_STUDIO_V1,
  studioSettings,
  assertStudioApproved,
  studioHash,
} from 'src/image-enhancement/brand-studio.config';
import { falStudioLimits } from 'src/image-enhancement/fal-studio.config';
import { studioCodec, validateStudioPlate } from 'src/image-enhancement/brand-studio-codec';
import { falStudioRequest } from 'src/image-enhancement/fal-studio.provider';
import { planTabletopPlacement } from 'src/image-enhancement/tabletop-placement';
describe('explicit tabletop presets, local-first and unchanged captured foreground', () => {
  jest.setTimeout(30000); // Four bounded 1K local raster compositions, no network.
  const mock = () =>
    new ConfigService({
      GEMINI_BRAND_STUDIO_ENABLED: 'true',
      GEMINI_BRAND_STUDIO_PROVIDER: 'mock',
      FAL_TABLETOP_STYLES_ENABLED: 'true',
    });
  const scene = () =>
    sharp(
      Buffer.from(
        '<svg width="1024" height="1024"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#F8F6F1"/><stop offset="1" stop-color="#D2B898"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><path d="M0 680H1024" stroke="#C2AF99"/></svg>',
      ),
    )
      .png()
      .toBuffer();
  it('three separate fixed prompt templates, no custom caller prompt or provider swap', () => {
    expect(TABLETOP_STYLES).toHaveLength(3);
    expect(new Set(TABLETOP_STYLES.map((s) => s.profile.prompt)).size).toBe(3);
    for (const style of TABLETOP_STYLES) {
      const s = studioSettings(mock(), style.profile.name);
      expect(s.profile.name).toBe(style.profile.name);
      expect(s.profile.sceneGate).toBe('tabletop-v2');
      const request = falStudioRequest(
        Buffer.from('contract-reference-only'),
        s.profile,
        planTabletopPlacement(
          { left: 0, top: 0, width: 300, height: 400 },
          { camera: 'TOP_DOWN', quarterTurns: 0, horizontal: 0.5 },
          { left: 0, right: 299 },
          false,
        ),
      );
      expect(request.prompt).toContain('EMPTY');
      expect(request.prompt).toContain('locally');
      expect(request.num_images).toBe(1);
    }
    expect(() => studioSettings(mock(), 'untrusted-prompt')).toThrow('STUDIO_PRESET_INVALID');
  });
  it('paid tabletop is disabled by default and ordinary neutral uses the same old profile hash', () => {
    const c = new ConfigService({
      GEMINI_BRAND_STUDIO_ENABLED: 'true',
      GEMINI_BRAND_STUDIO_PROVIDER: 'mock',
      FAL_TABLETOP_STYLES_ENABLED: 'false',
    });
    expect(studioSettings(c).styleHash).toBe(studioHash(JSON.stringify(CATALOG_STUDIO_V1)));
    expect(() => assertStudioApproved(c, TABLETOP_STYLES[0].profile.name)).toThrow(
      'STUDIO_DISABLED',
    );
  });
  it('owner-specific six-request caps require carried reservations and zero regeneration', () => {
    const values = {
      FAL_TABLETOP_PILOT_APPROVED: 'true',
      FAL_TABLETOP_APPROVAL_ID: 'REZONA_TABLETOP_SIX_20261122',
      FAL_TABLETOP_PRIOR_COMMITMENT_USD: '0.348160',
      FAL_TABLETOP_APPROVED_STYLE_HASHES: JSON.stringify(
        TABLETOP_STYLES.map((s) => studioHash(JSON.stringify(s.profile))),
      ),
      FAL_BRAND_STUDIO_MAX_REGENERATIONS: '0',
      FAL_BRAND_STUDIO_MONTHLY_BUDGET_USD: '10',
      FAL_BRAND_STUDIO_DAILY_BUDGET_USD: '1.50',
      FAL_BRAND_STUDIO_PILOT_BUDGET_USD: '1.10',
    };
    const f = falStudioLimits(new ConfigService(values));
    expect(f.maxRequests).toBe(6);
    expect(f.carryCommitment.toString()).toBe('0.34816');
    expect(f.reserve.mul(6).toString()).toBe('1.04448');
    for (const override of [
      { FAL_TABLETOP_PRIOR_COMMITMENT_USD: '0' },
      { FAL_BRAND_STUDIO_MAX_REGENERATIONS: '1' },
      { FAL_BRAND_STUDIO_DAILY_BUDGET_USD: '1.51' },
    ])
      expect(() => falStudioLimits(new ConfigService({ ...values, ...override }))).toThrow();
  });
  it('new scene gate does not weaken legacy neutral gate; flat paid scenes fail value gate', async () => {
    const bytes = await scene();
    await expect(validateStudioPlate(bytes, CATALOG_STUDIO_V1)).rejects.toThrow();
    await expect(
      validateStudioPlate(bytes, TABLETOP_STYLES_V1[1].profile),
    ).resolves.toBeUndefined();
    const flat = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: '#F8F6F1' },
    })
      .png()
      .toBuffer();
    await expect(validateStudioPlate(flat, TABLETOP_STYLES_V1[0].profile)).rejects.toThrow(
      'STUDIO_NO_MEANINGFUL_SCENE_KEEP_LOCAL',
    );
  });
  it('all presets recompose the EXACT same captured foreground as neutral; no generated RGB used', async () => {
    const bytes = await sharp(
      Buffer.from(
        '<svg width="500" height="500"><rect x="100" y="50" width="300" height="390" fill="#185041"/><text x="130" y="200" fill="white">REAL BRAND 250ml</text></svg>',
      ),
    )
      .png()
      .toBuffer();
    const mask = await sharp(bytes).extractChannel('alpha').png().toBuffer();
    const input = {
      bytes,
      mime: 'image/png',
      mask,
      mode: 'GEMINI_BRAND_STUDIO',
      matting: false,
      background: 'WHITE',
    };
    const neutral = await studioCodec({ ...input, studioProfile: CATALOG_STUDIO_V1 });
    for (const style of TABLETOP_STYLES) {
      const out = await studioCodec({
        ...input,
        studioProfile: style.profile,
        placement: { camera: 'TOP_DOWN', quarterTurns: 0, horizontal: 0.5 },
      });
      expect(out.foreground?.equals(neutral.foreground!)).toBe(true);
      expect(out.details?.foregroundHash).toBe(neutral.details?.foregroundHash);
      expect(out.warnings).toContain('TABLETOP_SCENE_SEMANTIC_REVIEW_REQUIRED');
      expect(out.warnings).toContain('COMPARE_LOCAL_MEANINGFUL_VALUE_REQUIRED');
    }
  });
});
