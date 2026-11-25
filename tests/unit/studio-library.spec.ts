import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import {
  STUDIO_TEMPLATES,
  STUDIO_GROUPS,
  studioCatalog,
  studioTemplate,
  studioPromptHash,
  studioProviderRequest,
  validateStudioSelection,
  suggestStudioGroup,
} from 'src/image-enhancement/studio-templates';
import {
  assertStudioLibraryApproved,
  reviewedStudioPricing,
  studioLibraryProfile,
  studioLibraryCostView,
} from 'src/image-enhancement/studio-library.config';
import { studioLibraryCodec } from 'src/image-enhancement/studio-library-codec';
import { planTabletopPlacement } from 'src/image-enhancement/tabletop-placement';
import {
  renderStudioPlate,
  validateStudioPremiumRaster,
} from 'src/image-enhancement/studio-scenes';
import { isPromotionalCandidate } from 'src/image-enhancement/studio-media-role';
import { selectedIntakeAsset } from 'src/image-enhancement/enhancement-selection';
import { publishedIntakeMedia } from 'src/files/intake-media-visibility';
import { ImageEditingProvider } from 'src/image-enhancement/enhancement.provider';

describe('20 premium templates — offline, no provider traffic', () => {
  jest.setTimeout(90000);
  const pose = { camera: 'TOP_DOWN' as const, quarterTurns: 0 as const, horizontal: 0.5 };
  const geometry = planTabletopPlacement(
    { left: 0, top: 0, width: 120, height: 180 },
    pose,
    { left: 0, right: 119 },
    false,
  );
  const c = () =>
    new ConfigService({ PRODUCT_STUDIO_ENABLED: 'true', PRODUCT_STUDIO_MOCK_APPROVED: 'true' });
  it('has exactly 20 unique immutable templates, five per group and 39 mode-specific prompt hashes', () => {
    expect(STUDIO_TEMPLATES).toHaveLength(20);
    expect(new Set(STUDIO_TEMPLATES.map((t) => t.id)).size).toBe(20);
    const hashes = [];
    for (const g of STUDIO_GROUPS) expect(studioCatalog(g)).toHaveLength(5);
    for (const t of STUDIO_TEMPLATES) {
      expect(Object.isFrozen(t)).toBe(true);
      expect(Object.isFrozen(t.scene)).toBe(true);
      expect(t.nameAr).toMatch(/[\u0600-\u06ff]/);
      expect(t.descriptionAr.length).toBeGreaterThan(25);
      expect(t.scenePrompt.length).toBeGreaterThan(400);
      expect(t.thumbnailAsset).toBe(`local-studio-concept/${t.code.toLowerCase()}-v1`);
      for (const m of t.supportedModes) hashes.push(studioPromptHash(t, m));
    }
    expect(hashes).toHaveLength(39);
    expect(new Set(hashes).size).toBe(39);
    expect(JSON.stringify(studioCatalog())).not.toContain('scenePrompt');
  });
  it('rejects unknown/version/mode, ghost mannequin lacks volume evidence, hanging and inaccurate flat pose', () => {
    expect(() => studioTemplate('attacker', 1)).toThrow();
    expect(() => studioTemplate(STUDIO_TEMPLATES[0].id, 2)).toThrow();
    const base = {
      templateId: STUDIO_TEMPLATES[0].id,
      templateVersion: 1,
      processingMode: 'FAITHFUL_COMPOSITE' as const,
      sourceKind: 'BOX' as const,
    };
    expect(() => validateStudioSelection(base, pose)).not.toThrow();
    expect(() =>
      validateStudioSelection(
        { ...base, sourceKind: 'FLAT_GARMENT' },
        { ...pose, camera: 'UPRIGHT' },
      ),
    ).toThrow();
    expect(() =>
      validateStudioSelection({ ...base, sourceKind: 'HANGING_GARMENT' }, pose),
    ).toThrow();
    const ghost = { ...base, templateId: STUDIO_TEMPLATES[3].id };
    expect(() => validateStudioSelection(ghost, pose)).toThrow();
    expect(() =>
      validateStudioSelection({ ...ghost, processingMode: 'GENERATIVE_3D_HERO' }),
    ).toThrow('STUDIO_GARMENT_EVIDENCE_REQUIRED');
    expect(() =>
      validateStudioSelection({
        ...ghost,
        processingMode: 'GENERATIVE_3D_HERO',
        sourceKind: 'VOLUME_GARMENT',
        evidenceReviewed: true,
      }),
    ).not.toThrow();
    expect(suggestStudioGroup('الإلكترونيات').group).toBe('ELECTRONICS');
    expect(suggestStudioGroup('Unmapped QA').group).toBe('GENERAL');
  });
  it('constructs only the exact official Nano Banana Lite fields and distinct mode instructions', () => {
    const t = STUDIO_TEMPLATES[5];
    for (const mode of t.supportedModes) {
      const req = studioProviderRequest(Buffer.from('test'), t, mode, geometry);
      expect(Object.keys(req).sort()).toEqual(
        [
          'prompt',
          'system_prompt',
          'image_urls',
          'aspect_ratio',
          'num_images',
          'output_format',
          'safety_tolerance',
          'sync_mode',
          'limit_generations',
        ].sort(),
      );
      expect(req.num_images).toBe(1);
      expect(req.sync_mode).toBe(true);
      expect(req.limit_generations).toBe(true);
      expect(req.image_urls).toEqual(['data:image/png;base64,dGVzdA==']);
      expect(req.system_prompt).toContain(
        mode === 'FAITHFUL_COMPOSITE' ? 'EMPTY' : 'Reconstruct ONE',
      );
    }
    expect(() =>
      studioProviderRequest(Buffer.alloc(7 * 1024 * 1024), t, 'GENERATIVE_3D_HERO'),
    ).toThrow();
    expect(() => studioProviderRequest(Buffer.from('a'), t, 'FAITHFUL_COMPOSITE')).toThrow();
  });
  it('default-disabled, no assumed price, mock zero; live gates cannot be enabled by browsing', () => {
    const s = {
      templateId: STUDIO_TEMPLATES[0].id,
      templateVersion: 1,
      processingMode: 'FAITHFUL_COMPOSITE' as const,
    };
    expect(() => assertStudioLibraryApproved(new ConfigService(), s)).toThrow();
    expect(assertStudioLibraryApproved(c(), s).reserve.toString()).toBe('0');
    expect(
      studioLibraryCostView(new ConfigService({ PRODUCT_STUDIO_PROVIDER: 'fal' }))
        .generationEnabled,
    ).toBe(false);
    expect(() => reviewedStudioPricing(new ConfigService())).toThrow(
      'STUDIO_REVIEWED_PRICING_REQUIRED',
    );
  });
  it.each(STUDIO_TEMPLATES.map((t) => [t.code, t] as const))(
    '%s: truthful local plate, native faithful pixels and/or labeled generated workflow',
    async (_code, t) => {
      const bytes = await sharp(
        Buffer.from(
          '<svg width="220" height="260"><rect x="40" y="40" width="120" height="180" fill="#235672"/><rect x="40" y="50" width="10" height="20" fill="#C37A24"/></svg>',
        ),
      )
        .png()
        .toBuffer();
      const mask = await sharp(bytes).extractChannel('alpha').png().toBuffer();
      const plate = await renderStudioPlate(t, geometry);
      await expect(
        validateStudioPremiumRaster(plate, geometry.canvasEdge, true),
      ).resolves.toBeDefined();
      for (const mode of t.supportedModes) {
        const profile = studioLibraryProfile(t, mode),
          input = {
            bytes,
            mask,
            mime: 'image/png',
            mode: mode === 'FAITHFUL_COMPOSITE' ? 'PRODUCT_STUDIO_FAITHFUL' : 'PRODUCT_STUDIO_HERO',
            background: 'WHITE',
            matting: false,
            studioProfile: profile,
            placement: pose,
          };
        const prep = await studioLibraryCodec(input);
        expect(prep.providerInput).toBeDefined();
        const out = await new ImageEditingProvider(c()).productStudio(
          prep.providerInput!,
          'a'.repeat(64),
          'b'.repeat(64),
          { templateId: t.id, templateVersion: 1, processingMode: mode, sourceKind: 'BOX' },
          prep.details?.placement as typeof geometry,
        );
        const final = await studioLibraryCodec({ ...input, generated: out.bytes });
        if (mode === 'FAITHFUL_COMPOSITE') {
          expect(final.details?.opaqueRgbMismatches).toBe(0);
          expect(final.details?.preparedOpaquePixels).toBeGreaterThan(21000);
        } else {
          expect(final.details?.mediaRole).toBe('AI_PROMOTIONAL');
          expect(final.details?.opaqueRgbPreserved).toBe(false);
          expect(
            (await sharp(final.png).raw().toBuffer()).equals(
              await sharp(out.bytes).raw().toBuffer(),
            ),
          ).toBe(true);
        }
      }
    },
  );
  it('refuses white/flat plates; rejects promotional authority and public media even after factual association', async () => {
    const white = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await expect(validateStudioPremiumRaster(white, 1024, true)).rejects.toThrow();
    const promo = { mediaRole: 'AI_PROMOTIONAL', job: { mode: 'PRODUCT_STUDIO_HERO' } };
    expect(isPromotionalCandidate(promo)).toBe(true);
    const original = { id: 'original', url: '/original' };
    const tx = {
      productImageEnhancementDecision: {
        findFirst: () =>
          Promise.resolve({ selectedCandidateId: 'promo', selectedCandidate: promo }),
      },
      productImageEnhancementCandidate: { findFirst: () => Promise.resolve(promo) },
      productListing: { findFirst: jest.fn() },
    };
    expect(
      await selectedIntakeAsset(tx as never, { id: 'draft' } as never, 'image', original),
    ).toBe(original);
    expect(
      await publishedIntakeMedia(
        tx as never,
        'products/intake-promo.png',
        'product',
        new ConfigService(),
      ),
    ).toBe(false);
    expect(tx.productListing.findFirst).not.toHaveBeenCalled();
  });
});
