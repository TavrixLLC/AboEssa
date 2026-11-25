import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { prepaidStudioEvidence } from 'src/image-enhancement/prepaid-studio-policy';
import {
  assertStudioLibrarySource,
  studioLibraryProfile,
} from 'src/image-enhancement/studio-library.config';
import { STUDIO_TEMPLATES } from 'src/image-enhancement/studio-templates';
import { studioLibraryCodec } from 'src/image-enhancement/studio-library-codec';
import { ImageEnhancementService } from 'src/image-enhancement/enhancement.service';

describe('original-reference hero is not an approved-mask bypass', () => {
  const evidence = {
    approvalId: 'owner-prepaid-12345678',
    evidenceId: 'fal-account-review-12345678',
    observedAt: new Date().toISOString(),
    balanceUsd: '9.83',
    autoTopUp: false,
    plan: 'PAY_AS_YOU_GO',
    invoiceDueUsd: '0',
    prepaidOnly: true,
    noRecharge: true,
    historicalReservedUsd: '1.044480',
  };
  const config = (extra = {}) =>
    new ConfigService({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://fake:fake@127.0.0.1:55456/rezona_real_studio_qa_12345678',
      PRODUCT_STUDIO_PREPAID_EXPERIMENT: 'true',
      PRODUCT_STUDIO_PREPAID_EVIDENCE_JSON: JSON.stringify(evidence),
      ...extra,
    });
  it('requires fresh backend-only prepaid/topup/no-recharge evidence on the isolated DB', () => {
    expect(prepaidStudioEvidence(config())!.balance.toString()).toBe('9.83');
    for (const patch of [
      { autoTopUp: true },
      { balanceUsd: '100' },
      { plan: 'SUBSCRIPTION' },
      { historicalReservedUsd: '0' },
      { observedAt: new Date(Date.now() - 3600001).toISOString() },
    ])
      expect(() =>
        prepaidStudioEvidence(
          config({
            PRODUCT_STUDIO_PREPAID_EVIDENCE_JSON: JSON.stringify({ ...evidence, ...patch }),
          }),
        ),
      ).toThrow();
    expect(() => prepaidStudioEvidence(config({ NODE_ENV: 'production' }))).toThrow();
    expect(prepaidStudioEvidence(new ConfigService())).toBeNull();
  });
  it('allows original-only source scope for hero, never faithful or a substituted mask', () => {
    const c = config({
      PRODUCT_STUDIO_APPROVED_SOURCES_JSON: JSON.stringify([
        { sourceHash: 'a'.repeat(64), referenceKind: 'ORIGINAL_REFERENCE' },
      ]),
    });
    expect(() =>
      assertStudioLibrarySource(c, 'a'.repeat(64), '', 'GENERATIVE_3D_HERO', 'ORIGINAL_REFERENCE'),
    ).not.toThrow();
    expect(() =>
      assertStudioLibrarySource(c, 'a'.repeat(64), '', 'FAITHFUL_COMPOSITE', 'ORIGINAL_REFERENCE'),
    ).toThrow();
    expect(() =>
      assertStudioLibrarySource(c, 'a'.repeat(64), 'b'.repeat(64), 'GENERATIVE_3D_HERO'),
    ).toThrow();
    expect(() =>
      assertStudioLibrarySource(c, 'c'.repeat(64), '', 'GENERATIVE_3D_HERO', 'ORIGINAL_REFERENCE'),
    ).toThrow();
  });
  it('bounds the original reference without crop/mask and makes no preserved-pixel claim', async () => {
    const bytes = await sharp({
      create: { width: 900, height: 1600, channels: 3, background: '#ccddee' },
    })
      .jpeg()
      .toBuffer();
    const input = {
      bytes,
      mime: 'image/jpeg',
      mode: 'PRODUCT_STUDIO_HERO',
      matting: false,
      background: 'WHITE',
      originalReference: true,
      studioProfile: studioLibraryProfile(STUDIO_TEMPLATES[5], 'GENERATIVE_3D_HERO'),
    };
    const r = await studioLibraryCodec(input),
      m = await sharp(r.providerInput).metadata();
    expect([m.width, m.height]).toEqual([864, 1536]);
    expect(r.details?.opaqueRgbPreserved).toBe(false);
    expect(r.details?.maskHash).toBeNull();
    expect(r.metrics.maskKind).toBe('NONE_ORIGINAL_REFERENCE');
    await expect(studioLibraryCodec({ ...input, mask: Buffer.from('fake') })).rejects.toThrow(
      'STUDIO_ORIGINAL_REFERENCE_HERO_ONLY',
    );
    await expect(
      studioLibraryCodec({
        ...input,
        studioProfile: studioLibraryProfile(STUDIO_TEMPLATES[5], 'FAITHFUL_COMPOSITE'),
      }),
    ).rejects.toThrow('STUDIO_ORIGINAL_REFERENCE_HERO_ONLY');
    await expect(studioLibraryCodec({ ...input, bytes: Buffer.from('invalid') })).rejects.toThrow();
  });
  it('rechecks original ownership, active capture, media revision and private asset before transport/use', async () => {
    const session = { status: 'DRAFT', selectedImageKey: 'capture', mediaRevision: 3 };
    const image = {
      sessionId: 's',
      clientImageId: 'capture',
      status: 'READY',
      requestHash: 'a'.repeat(64),
      assetId: 'asset',
      asset: { intakePrivate: true, intakeProductId: null },
    };
    const db = {
      productIntakeSession: { findUniqueOrThrow: jest.fn().mockResolvedValue(session) },
      productIntakeImage: { findUnique: jest.fn().mockResolvedValue(image) },
    };
    const s = new ImageEnhancementService(
      db as never,
      new ConfigService(),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const call = () => s['studioOriginalSource']('s', 'image', 3);
    expect((await call()).originalAssetId).toBe('asset');
    for (const patch of [
      { status: 'FAILED' },
      { clientImageId: 'retaken' },
      { sessionId: 'other' },
      { asset: { intakePrivate: false, intakeProductId: null } },
    ]) {
      const old = { ...image };
      Object.assign(image, patch);
      await expect(call()).rejects.toThrow();
      Object.assign(image, old);
    }
    session.mediaRevision++;
    await expect(call()).rejects.toThrow();
  });
  it('rejects use of original reference in local/faithful modes before any DB or provider access', async () => {
    const provider = { productStudio: jest.fn() },
      db = { $transaction: jest.fn() };
    const s = new ImageEnhancementService(
      db as never,
      new ConfigService({
        IMAGE_ENHANCEMENT_ENABLED: 'true',
        IMAGE_ENHANCEMENT_LOCAL_ENABLED: 'true',
      }),
      {} as never,
      {} as never,
      provider as never,
      {} as never,
    );
    for (const mode of ['CLEAN', 'PRODUCT_STUDIO_FAITHFUL']) {
      await expect(
        s.start(
          's',
          {
            mode: mode as never,
            clientImageId: 'capture',
            requestKey: 'request-12345678',
            referenceKind: 'ORIGINAL_REFERENCE',
            originalReferenceReviewed: true,
            sourceWarningsReviewed: true,
            studioSelection:
              mode === 'CLEAN'
                ? undefined
                : {
                    templateId: STUDIO_TEMPLATES[5].id,
                    templateVersion: 1,
                    processingMode: 'FAITHFUL_COMPOSITE',
                    sourceKind: 'BOX',
                  },
          },
          { id: 'owner', isOwner: true } as never,
        ),
      ).rejects.toThrow();
    }
    expect(provider.productStudio).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
