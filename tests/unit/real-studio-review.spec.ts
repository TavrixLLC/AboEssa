import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import * as review from 'src/image-enhancement/real-studio-review';
import * as isolation from 'src/image-enhancement/enhancement-isolate';
import { ImageEnhancementService } from 'src/image-enhancement/enhancement.service';
import { STUDIO_TEMPLATES } from 'src/image-enhancement/studio-templates';
import sharp from 'sharp';

describe('real-photo QA preview is not a paid or selection bypass', () => {
  afterEach(() => jest.restoreAllMocks());
  const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const photo = {
    photoId: 'RP-' + 'a'.repeat(16),
    tag: 'P01',
    filename: 'owner.jpeg',
    label: 'Owner box',
    sha256: 'a'.repeat(64),
    sourceStatus: 'ADMITTED_IMMUTABLE_ORIGINAL',
    sessionId: 's',
    clientImageId: 'capture',
    sourceCandidateId: 'c',
    sourceHash: 'b'.repeat(64),
    maskHash: 'c'.repeat(64),
    suggestedGroup: 'ELECTRONICS' as const,
    sourceKind: 'BOX' as const,
    recommendedTemplateId: STUDIO_TEMPLATES[5].id,
    templateVersion: 1,
    placement: { camera: 'TOP_DOWN' as const, quarterTurns: 0 as const, horizontal: 0.5 },
    segmentationStatus: 'READY_FOR_REVIEW',
    segmentationMethod: 'AUTOMATIC_REAL_ONNX',
    reasonAr: 'مراجعة',
    previewAllowed: true,
    employeeReview: 'PENDING' as const,
    providerStatus: 'REAL_FAL_NOT_AUTHORIZED' as const,
    priorQaProductId: null,
  };
  function service(p = { ...photo }, selected = 'capture', owner = 'owner') {
    jest.spyOn(review, 'readRealStudioReview').mockResolvedValue({
      datasetId: '12345678',
      evaluatedAt: new Date().toISOString(),
      photos: [p],
    });
    const db = {
      productIntakeSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's',
          status: 'DRAFT',
          selectedImageKey: selected,
          createdById: owner,
        }),
      },
      productImageEnhancementCandidate: { findUnique: jest.fn() },
      productImageEnhancementJob: {findMany:jest.fn().mockResolvedValue([])},
      $transaction: jest.fn(),
    };
    const provider = { productStudio: jest.fn(), studio: jest.fn() },
      config = new ConfigService({
        IMAGE_ENHANCEMENT_ENABLED: 'true',
        IMAGE_ENHANCEMENT_LOCAL_ENABLED: 'true',
      });
    return {
      db,
      provider,
      s: new ImageEnhancementService(
        db as never,
        config,
        {} as never,
        {} as never,
        provider as never,
        {} as never,
      ),
    };
  }
  it('requires explicit isolated QA scope; production, disabled, unsafe path and wrong DB fail closed', () => {
    const good = {
      REAL_PRODUCT_STUDIO_REVIEW_ENABLED: 'true',
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://fake:fake@127.0.0.1:55456/rezona_real_studio_qa_12345678',
      REAL_PRODUCT_STUDIO_REVIEW_INDEX: 'D:/rezona-real-studio-qa/run-12345678/review-index.json',
    };
    expect(() => review.assertRealStudioReviewScope(new ConfigService(good))).not.toThrow();
    for (const extra of [
      { NODE_ENV: 'production' },
      { REAL_PRODUCT_STUDIO_REVIEW_ENABLED: 'false' },
      { DATABASE_URL: 'postgresql://fake:fake@127.0.0.1:55455/other' },
      { REAL_PRODUCT_STUDIO_REVIEW_INDEX: 'C:/Users/secret.json' },
    ])
      expect(() =>
        review.assertRealStudioReviewScope(new ConfigService({ ...good, ...extra })),
      ).toThrow();
  });
  it('exposes all20 compatibility definitions, rejects ghost mannequin for boxes and does not generate', async () => {
    const x = service(),
      r = await x.s.realStudioReview({ id: 'owner', isOwner: true } as never);
    expect(r.photos).toHaveLength(1);
    expect(r.photos[0].compatibility).toHaveLength(20);
    expect(r.paidAuthorized).toBe(false);
    expect(x.provider.productStudio).not.toHaveBeenCalled();
    expect(x.db.$transaction).not.toHaveBeenCalled();
  });
  it('hides other employees and marks retaken sources unselectable rather than showing stale approval', async () => {
    const x = service({ ...photo }, 'new-capture');
    const r = await x.s.realStudioReview({ id: 'owner', isOwner: true } as never);
    expect(r.photos[0]).toMatchObject({
      sourceStatus: 'SOURCE_CHANGED_REVIEW_REQUIRED',
      sourceCandidateId: null,
      previewAllowed: false,
    });
    expect(
      (await x.s.realStudioReview({ id: 'stranger', permissions: [] } as never)).photos,
    ).toHaveLength(0);
  });
  it.each(['unsafe', 'retake', 'ghost'] as const)(
    '%s blocks before image IO or provider dispatch',
    async (kind) => {
      const x = service(
        { ...photo, previewAllowed: kind !== 'unsafe' },
        kind === 'retake' ? 'retaken' : 'capture',
      );
      await expect(
        x.s.localStudioReviewPreview(
          photo.photoId,
          kind === 'ghost' ? STUDIO_TEMPLATES[3].id : photo.recommendedTemplateId,
          1,
          { id: 'owner', isOwner: true } as never,
        ),
      ).rejects.toMatchObject({ status: kind === 'ghost' ? 400 : 409 });
      expect(x.db.productImageEnhancementCandidate.findUnique).not.toHaveBeenCalled();
      expect(x.provider.productStudio).not.toHaveBeenCalled();
      expect(x.db.$transaction).not.toHaveBeenCalled();
    },
  );
  it('positive derived LOCAL PREVIEW has no candidate ID, no approval/write, no provider and immutable hashes', async () => {
    const bytes = await sharp({
        create: { width: 32, height: 32, channels: 3, background: '#123456' },
      })
        .png()
        .toBuffer(),
      mask = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'white' } })
        .greyscale()
        .png()
        .toBuffer();
    const p = {
        ...photo,
        sourceHash: hash(Buffer.concat([Buffer.from('image/png'), bytes])),
        maskHash: hash(mask),
      },
      x = service(p);
    x.db.productImageEnhancementCandidate.findUnique.mockResolvedValue({
      maskAsset: { key: 'mask', intakePrivate: true },
      job: {
        sessionId: 's',
        mode: 'NEURAL_BACKGROUND_REMOVE',
        status: 'COMPLETED',
        sourceHash: p.sourceHash,
        image: { clientImageId: 'capture', asset: { key: 'source' } },
      },
    });
    jest
      .spyOn(
        x.s as unknown as { read: (key: string) => Promise<{ bytes: Buffer; mime: string }> },
        'read',
      )
      .mockImplementation((key) =>
        Promise.resolve({ bytes: key === 'mask' ? mask : bytes, mime: 'image/png' }),
      );
    jest.spyOn(isolation, 'isolatedEnhancement').mockResolvedValue({
      png: bytes,
      warnings: [],
      details: { opaqueRgbMismatches: 0 },
      metrics: {} as never,
    });
    const r = await x.s.localStudioReviewPreview(p.photoId, p.recommendedTemplateId, 1, {
      id: 'owner',
      isOwner: true,
    } as never);
    expect(r).toMatchObject({
      label: 'LOCAL PREVIEW',
      realFal: false,
      employeeApproval: 'PENDING',
      selectableCandidate: false,
    });
    expect(r).not.toHaveProperty('candidateId');
    expect(r.lineage.maskHash).toBe(p.maskHash);
    expect(x.db.$transaction).not.toHaveBeenCalled();
    expect(x.provider.productStudio).not.toHaveBeenCalled();
  });
});
