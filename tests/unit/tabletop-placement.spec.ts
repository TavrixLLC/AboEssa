import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import {
  TABLETOP_STYLES,
  TABLETOP_STYLES_V1,
  studioSettings,
} from 'src/image-enhancement/brand-studio.config';
import { tabletopNativeCodec } from 'src/image-enhancement/tabletop-native-codec';
import {
  planTabletopPlacement,
  validateTabletopPlacement,
} from 'src/image-enhancement/tabletop-placement';
import {
  renderLocalTabletop,
  validateTabletopV2Plate,
} from 'src/image-enhancement/tabletop-scenes';
import { assertFalSourcePresetNotUnknown } from 'src/image-enhancement/fal-studio.config';
import { falStudioRequest } from 'src/image-enhancement/fal-studio.provider';
import { ImageEditingProvider } from 'src/image-enhancement/enhancement.provider';
import { ImageEnhancementService } from 'src/image-enhancement/enhancement.service';

describe('Phase 7.3.1 native tabletop geometry, no inference', () => {
  jest.setTimeout(30000);
  const placement = { camera: 'TOP_DOWN' as const, quarterTurns: 0 as const, horizontal: 0.5 };
  const geometry = planTabletopPlacement(
    { left: 12, top: 20, width: 120, height: 180 },
    placement,
    { left: 0, right: 119 },
    false,
  );
  const sample = async () => {
    // Deliberately asymmetric real RGB fixture, disconnected accessory and feathered boundary.
    const bytes = await sharp(
      Buffer.from(
        '<svg width="250" height="250"><rect x="40" y="30" width="100" height="160" fill="#194E72"/><rect x="40" y="30" width="20" height="30" fill="#D19840"/><rect x="160" y="150" width="12" height="20" fill="#A45532"/><rect x="39" y="31" width="1" height="150" fill="#194E72" opacity=".5"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    return {
      bytes,
      mask: await sharp(bytes).extractChannel('alpha').png().toBuffer(),
      mime: 'image/png',
      mode: 'GEMINI_BRAND_STUDIO',
      matting: false,
      background: 'WHITE',
      studioProfile: TABLETOP_STYLES[0].profile,
    };
  };
  it.each([
    null,
    {},
    { ...placement, camera: 'GUESS' },
    { ...placement, quarterTurns: 1.5 },
    { ...placement, horizontal: 0.7 },
    { ...placement, horizontal: NaN },
    { ...placement, inventedPerspective: true },
  ])('never invents unreviewed geometry: %p', (p) => {
    expect(() => validateTabletopPlacement(p)).toThrow('TABLETOP_PLACEMENT_REVIEW_REQUIRED');
  });
  it('lying package has full tabletop; upright source has explicit plane and actual contact', () => {
    expect(
      JSON.stringify(
        validateTabletopPlacement({ horizontal: 0.5, quarterTurns: 0, camera: 'TOP_DOWN' }),
      ),
    ).toBe(JSON.stringify(placement));
    expect(geometry.table.y).toBe(0);
    expect(geometry.contact.kind).toBe('CAPTURED_ALPHA_FOOTPRINT_ON_TABLE');
    const standing = planTabletopPlacement(
      geometry.sourceMaskBox,
      { ...placement, camera: 'UPRIGHT' },
      { left: 7, right: 100 },
      true,
    );
    expect(standing.table.y).toBe(Math.round(standing.canvasEdge * 0.57));
    expect(standing.contact.y).toBe(standing.foregroundOrigin.y + standing.rotatedSize.height - 1);
    expect(standing.contact.spanLeft).toBe(standing.foregroundOrigin.x + 7);
    expect(standing.shadow.keyFrom).toBe('UPPER_LEFT');
    expect(standing.shadow.castDx).toBeGreaterThan(0);
    expect(standing.shadow.castDy).toBeGreaterThan(0);
    expect(() =>
      planTabletopPlacement(
        { left: 0, top: 0, width: 2400, height: 3000 },
        placement,
        { left: 0, right: 2399 },
        false,
      ),
    ).toThrow('TABLETOP_NATIVE_TOO_LARGE_RECAPTURE');
  });
  it.each([0, 1, 2, 3] as const)(
    'every opaque source pixel maps exactly under native quarter-turn %i',
    async (q) => {
      const input = await sample(),
        source = await sharp(input.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const output = await tabletopNativeCodec({
        ...input,
        placement: { ...placement, quarterTurns: q },
      });
      const g = output.details!.placement as typeof geometry,
        final = await sharp(output.png).ensureAlpha().raw().toBuffer();
      let count = 0;
      for (let y = 0; y < source.info.height; y++)
        for (let x = 0; x < source.info.width; x++) {
          const i = (y * source.info.width + x) * 4;
          if (source.data[i + 3] !== 255) continue;
          const sx = x - g.sourceMaskBox.left,
            sy = y - g.sourceMaskBox.top,
            w = g.sourceMaskBox.width,
            h = g.sourceMaskBox.height;
          const [rx, ry] =
            q === 0
              ? [sx, sy]
              : q === 1
                ? [h - 1 - sy, sx]
                : q === 2
                  ? [w - 1 - sx, h - 1 - sy]
                  : [sy, w - 1 - sx];
          const j = ((g.foregroundOrigin.y + ry) * g.canvasEdge + g.foregroundOrigin.x + rx) * 4;
          if (!source.data.subarray(i, i + 3).equals(final.subarray(j, j + 3)))
            throw Error(`RGB mismatch at ${x},${y}`);
          count++;
        }
      expect(count).toBeGreaterThan(16000);
      expect(g.productScale).toBe(1);
      expect(g.clockwiseRotationDegrees).toBe(q * 90);
      expect(output.details!.opaqueRgbMismatches).toBe(0);
      expect(output.warnings).toContain('LOCAL_CONCEPT_NOT_FAL_OUTPUT');
      expect((await sharp(output.png).metadata()).exif).toBeUndefined();
    },
  );
  it('deterministic materials are distinct and gates reject flat, cluttered, dark or transparent plates', async () => {
    const hashes = [];
    for (const s of TABLETOP_STYLES) {
      const b = await renderLocalTabletop(s.profile.name, geometry);
      expect(b.equals(await renderLocalTabletop(s.profile.name, geometry))).toBe(true);
      await expect(validateTabletopV2Plate(b, s.profile.name, geometry)).resolves.toBeUndefined();
      hashes.push(b.toString('base64'));
    }
    expect(new Set(hashes).size).toBe(3);
    for (const bg of ['#F5F4F1', '#302020', '#FFFFFF00']) {
      const b = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: bg } })
        .png()
        .toBuffer();
      await expect(
        validateTabletopV2Plate(b, TABLETOP_STYLES[0].profile.name, geometry),
      ).rejects.toThrow();
    }
    const clutter = await sharp(
      await renderLocalTabletop(TABLETOP_STYLES[1].profile.name, geometry),
    )
      .composite([
        {
          input: Buffer.from(
            '<svg width="1024" height="1024"><rect x="100" y="100" width="400" height="400" fill="#223311"/></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();
    await expect(
      validateTabletopV2Plate(clutter, TABLETOP_STYLES[1].profile.name, geometry),
    ).rejects.toThrow('TABLETOP_SCENE_OBJECT_COLOR_OR_CLUTTER_REJECTED');
  });
  it('wrong mask/source/provider dimensions fail without resampling a product', async () => {
    const input = await sample();
    const mask = await sharp({
      create: { width: 10, height: 10, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await expect(tabletopNativeCodec({ ...input, mask, placement })).rejects.toThrow(
      'STUDIO_MASK_ALIGNMENT_INVALID',
    );
    await expect(
      tabletopNativeCodec({
        ...input,
        bytes: Buffer.from('<svg width="10" height="10"/>'),
        placement,
      }),
    ).rejects.toThrow('TABLETOP_SOURCE_FORMAT_INVALID');
    await expect(tabletopNativeCodec({ ...input, generated: mask, placement })).rejects.toThrow(
      'TABLETOP_PROVIDER_PLATE_INVALID',
    );
  });
  it('new revisions require fresh live approval; unknown source/style stays fenced across revisions', () => {
    const c = new ConfigService({
      GEMINI_BRAND_STUDIO_ENABLED: 'true',
      GEMINI_BRAND_STUDIO_PROVIDER: 'fal',
      FAL_TABLETOP_STYLES_ENABLED: 'true',
    });
    expect(studioSettings(c, TABLETOP_STYLES[0].profile.name).enabled).toBe(false);
    const source = 'a'.repeat(64),
      warm = TABLETOP_STYLES[1].profile.name;
    expect(() => assertFalSourcePresetNotUnknown(c, source, warm)).toThrow(
      'FAL_UNRESOLVED_FENCE_REGISTRY_REQUIRED',
    );
    c.set(
      'FAL_TABLETOP_UNRESOLVED_SOURCE_PRESETS_JSON',
      JSON.stringify([{ sourceHash: source, preset: warm }]),
    );
    expect(TABLETOP_STYLES[1].profile.revision).not.toBe(TABLETOP_STYLES_V1[1].profile.revision);
    expect(() => assertFalSourcePresetNotUnknown(c, source, warm)).toThrow(
      'FAL_SOURCE_STYLE_UNKNOWN_BLOCKED',
    );
    expect(() => assertFalSourcePresetNotUnknown(c, 'b'.repeat(64), warm)).not.toThrow();
    expect(() => falStudioRequest(Buffer.from('unused'), TABLETOP_STYLES[0].profile)).toThrow(
      'TABLETOP_GEOMETRY_REQUIRED',
    );
    expect(
      falStudioRequest(Buffer.from('unused'), TABLETOP_STYLES[0].profile, geometry).prompt,
    ).toContain('PLANNED_GEOMETRY');
  });
  it('mock tabletop path is explicitly local and never calls a transport', async () => {
    const spy = jest.spyOn(global, 'fetch');
    try {
      const provider = new ImageEditingProvider(
        new ConfigService({
          GEMINI_BRAND_STUDIO_ENABLED: 'true',
          GEMINI_BRAND_STUDIO_PROVIDER: 'mock',
          FAL_TABLETOP_STYLES_ENABLED: 'true',
        }),
      );
      const r = await provider.studio(
        Buffer.from('not sent'),
        'unused',
        TABLETOP_STYLES[0].profile.name,
        geometry,
      );
      await expect(
        validateTabletopV2Plate(r.bytes, TABLETOP_STYLES[0].profile.name, geometry),
      ).resolves.toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it('start without employee placement review fails before DB, reserve, or provider work', async () => {
    const c = new ConfigService({
      IMAGE_ENHANCEMENT_ENABLED: 'true',
      IMAGE_ENHANCEMENT_LOCAL_ENABLED: 'true',
      GEMINI_BRAND_STUDIO_ENABLED: 'true',
      GEMINI_BRAND_STUDIO_PROVIDER: 'mock',
      FAL_TABLETOP_STYLES_ENABLED: 'true',
    });
    const db = { $transaction: jest.fn() },
      provider = { studio: jest.fn() },
      budget = { reserveImage: jest.fn() };
    const service = new ImageEnhancementService(
      db as never,
      c,
      {} as never,
      budget as never,
      provider as never,
      {} as never,
    );
    const request = {
      clientImageId: 'capture',
      requestKey: 'explicit',
      mode: 'GEMINI_BRAND_STUDIO' as const,
      stylePreset: TABLETOP_STYLES[0].profile.name,
    };
    await expect(service.start('draft', request, { isOwner: true } as never)).rejects.toMatchObject(
      { status: 400 },
    );
    await expect(
      service.start('draft', { ...request, placementReviewed: true }, { isOwner: true } as never),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(provider.studio).not.toHaveBeenCalled();
    expect(budget.reserveImage).not.toHaveBeenCalled();
  });
});
