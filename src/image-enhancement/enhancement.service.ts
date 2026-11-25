import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductIntakeSession, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { inventoryError as fail, InventoryTx } from 'src/inventory/inventory-ledger';
import { STORAGE_PROVIDER, StorageProvider } from 'src/files/storage-provider.interface';
import { RecognitionBudgetService } from 'src/ai/recognition-budget.service';
import { PermissionResolverService } from 'src/permissions/permission-resolver.service';
import { IMAGE_RECIPE, MAX_IMAGE_BYTES } from 'src/image-optimization/image-recipe';
import { inspectImage } from 'src/image-optimization/image-codec';
import {
  enhancementSettings,
  assertEditingApproved,
  ENHANCEMENT_RECIPE,
  EDIT_PROMPT_VERSION,
  EnhancementMode,
  isStudioMode,
} from './enhancement.config';
import { isolatedEnhancement } from './enhancement-isolate';
import { ImageEditingProvider, ImageProviderError } from './enhancement.provider';
import { CodecInput, CodecOutput } from './enhancement-codec';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readRealStudioReview } from './real-studio-review';
import { studioLibraryProfile } from './studio-library.config';
import { studioTemplate, STUDIO_TEMPLATES } from './studio-templates';
import {
  SEGMENTATION_MODELS,
  SEGMENTATION_RECIPE,
  SEGMENTATION_RUNTIME_VERSION,
  segmentationSettings,
} from './segmentation-model';
import { ForegroundRegion, SegmentOutput, validateForegroundRegion } from './segmentation-codec';
import { isolatedSegmentation } from './segmentation-isolate';
import {
  assertStudioApproved,
  studioSettings,
  STUDIO_RECIPE,
  TABLETOP_STYLES,
  tabletopStyle,
} from './brand-studio.config';
import type { StudioUsage } from './gemini-studio.provider';
import { assertFalStudioSource } from './fal-studio.config';
import type { FalStudioBilling } from './fal-studio.provider';
import { isPromotionalCandidate, isGenerativeImageMode } from './studio-media-role';
import {
  STUDIO_GROUPS,
  STUDIO_GROUP_LABELS,
  STUDIO_SOURCE_KINDS,
  STUDIO_LIBRARY_RECIPE,
  STUDIO_SYSTEM_VERSION,
  isLibraryStudioMode,
  studioJobMode,
  validateStudioSelection,
  studioCatalog,
  suggestStudioGroup,
  type StudioSelection,
  type StudioGroup,
} from './studio-templates';
import {
  assertStudioLibraryApproved,
  assertStudioLibrarySource,
  studioLibraryCostView,
} from './studio-library.config';
import {
  PREMIUM_3D_STYLE,
  PREMIUM_3D_MODE,
  PREMIUM_3D_LABEL,
  PREMIUM_3D_RECIPE,
  PREMIUM_3D_PROFILE,
  requirePremium3dReview,
} from './premium-3d.config';
import {
  validateTabletopPlacement,
  type TabletopPlacement,
  type TabletopGeometry,
} from './tabletop-placement';
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
async function storageDeadline<T>(
  promise: Promise<T>,
  onLate?: (value: T) => void,
  ms = 20000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  const guarded = promise.then((value) => {
    if (settled) onLate?.(value);
    return value;
  });
  try {
    return await Promise.race([
      guarded,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('IMAGE_STORAGE_TIMEOUT')), ms);
      }),
    ]);
  } finally {
    settled = true;
    clearTimeout(timer);
  }
}
const has = (a: AuthenticatedUser, p: string) =>
  a.isOwner || a.role === 'OWNER' || a.permissions?.includes(p);
type Start = {
  clientImageId: string;
  requestKey: string;
  mode: EnhancementMode;
  background?: string;
  generation?: number;
  foregroundRegion?: ForegroundRegion;
  sourceCandidateId?: string;
  maskReviewed?: boolean;
  privateTransferApproved?: boolean;
  stylePreset?: string;
  placement?: TabletopPlacement;
  placementReviewed?: boolean;
  generativeProductApproved?: boolean;
  referenceKind?: 'APPROVED_MASK' | 'ORIGINAL_REFERENCE';
  originalReferenceReviewed?: boolean;
  sourceWarningsReviewed?: boolean;
  studioSelection?: StudioSelection;
};
type Decision = {
  clientImageId: string;
  requestKey: string;
  expectedRevision: number;
  expectedMediaRevision: number;
  action: string;
  candidateId?: string;
  reviewed: boolean;
  sceneReviewed?: boolean;
  meaningfulImprovement?: boolean;
  identityReviewed?: boolean;
  premiumSceneReviewed?: boolean;
  generativeNatureAcknowledged?: boolean;
  materialMismatchObserved?: boolean;
  expectedDecisionRevision?: number;
};
@Injectable()
export class ImageEnhancementService {
  private previews = 0;
  private localStudioPreviews = 0;
  async realStudioReview(actor: AuthenticatedUser) {
    const index = await readRealStudioReview(this.config).catch(() =>
      fail('REAL_STUDIO_REVIEW_DISABLED', 'التقييم الخاص غير متاح في هذه البيئة', 404),
    );
    const visible: Record<string, unknown>[] = [];
    for (const p of index.photos) {
      let changed = false;
      if (p.sessionId) {
        try {
          const session = await this.owned(p.sessionId, actor);
          changed = session.status !== 'DRAFT' || session.selectedImageKey !== p.clientImageId;
        } catch {
          continue;
        }
      } else if (!has(actor, 'product_intake.manage_all')) continue;
      let originalReferenceValid = false;
      if (!changed && p.sessionId && p.clientImageId) {
        try {
          const image = await this.db.productIntakeImage.findUnique({
            where: {
              sessionId_clientImageId: { sessionId: p.sessionId, clientImageId: p.clientImageId },
            },
          });
          if (image) {
            await this.studioOriginalSource(p.sessionId, image.id);
            originalReferenceValid = true;
          }
        } catch {
          /* unavailable originals never become paid references */
        }
      }
      const compatibility = STUDIO_TEMPLATES.map((t) => {
        const modes = t.supportedModes.filter((mode) => {
          try {
            validateStudioSelection(
              {
                templateId: t.id,
                templateVersion: t.version,
                processingMode: mode,
                sourceKind: p.sourceKind,
                evidenceReviewed: false,
              },
              mode === 'FAITHFUL_COMPOSITE' ? p.placement : undefined,
            );
            return true;
          } catch {
            return false;
          }
        });
        return {
          id: t.id,
          version: t.version,
          nameAr: t.nameAr,
          category: t.category,
          supportedModes: t.supportedModes,
          compatibleModes: modes,
          warning: t.highRisk
            ? 'GHOST_MANNEQUIN_REQUIRES_APPROVED_VOLUME_GARMENT_EVIDENCE'
            : t.category !== p.suggestedGroup
              ? 'DIFFERENT_STYLE_GROUP_NOT_A_CATALOG_CATEGORY_CHANGE'
              : null,
        };
      });
      const realFalResults =
        p.sessionId && !changed
          ? await this.db.productImageEnhancementJob.findMany({
              where: {
                sessionId: p.sessionId,
                provider: 'fal',
                image: { clientImageId: p.clientImageId! },
              },
              orderBy: { createdAt: 'desc' },
              take: 20,
              include: {
                candidate: { select: { id: true, mediaRole: true, qualityStatus: true } },
              },
            })
          : [];
      const resultDecisions: Record<string, string> = {};
      for (const j of realFalResults)
        if (j.candidate) {
          const decision = await this.db.productImageEnhancementDecision.findFirst({
            where: { sessionId: p.sessionId!, targetCandidateId: j.candidate.id },
            orderBy: { revision: 'desc' },
          });
          resultDecisions[j.candidate.id] = decision?.action ?? 'PENDING';
        }
      visible.push({
        ...p,
        providerStatus: realFalResults.length
          ? ({
              COMPLETED: 'REAL_FAL_COMPLETED',
              FAILED: 'REAL_FAL_FAILED',
              UNKNOWN: 'REAL_FAL_UNKNOWN',
            }[realFalResults[0].status] ?? 'REAL_FAL_IN_PROGRESS')
          : 'REAL_FAL_NOT_GENERATED',
        compatibility,
        originalReferenceValid,
        realFalResults: realFalResults.map((j) => ({
          jobId: j.id,
          status: j.status,
          errorCode: j.errorCode,
          providerRequestId: j.providerRequestId,
          selection:
            (j.parameters as { studioSelection?: StudioSelection }).studioSelection ?? null,
          referenceKind:
            (j.parameters as { referenceKind?: string }).referenceKind ?? 'APPROVED_MASK',
          candidateId: j.candidate?.id ?? null,
          mediaRole: j.candidate?.mediaRole ?? null,
          qualityStatus: j.candidate?.qualityStatus ?? null,
          reviewAction: j.candidate ? resultDecisions[j.candidate.id] : 'PENDING',
          label: 'REAL FAL RESULT — EMPLOYEE REVIEW REQUIRED',
        })),
        sourceWarning:
          p.sourceStatus === 'RECAPTURE_NEEDED'
            ? 'CROPPED_OBSCURED_OR_INCOMPLETE_SOURCE_REVIEW_REQUIRED'
            : 'PRESERVE_PHOTOGRAPHED_PACKAGING_AND_ALL_VISIBLE_PARTS',
        faithfulMessage:
          'تعذر إنشاء معاينة محلية دقيقة لأن عزل المنتج يحتاج مراجعة. الصورة الأصلية محفوظة.',
        generativeMessage:
          'يمكن تجربة عرض دعائي بالذكاء الاصطناعي باستخدام الصورة الأصلية، لكن النتيجة قد تختلف عن المنتج الحقيقي وتحتاج مراجعة قبل اعتمادها.',
        ...(changed
          ? {
              sourceStatus: 'SOURCE_CHANGED_REVIEW_REQUIRED',
              previewAllowed: false,
              sourceCandidateId: null,
              reasonAr: 'تغيّرت اللقطة أو المسودة؛ النتائج القديمة لا تُختار، ويلزم تقييم جديد.',
            }
          : {}),
      });
    }
    return {
      datasetId: index.datasetId,
      evaluatedAt: index.evaluatedAt,
      total: visible.length,
      photos: visible,
      paidAuthorized:
        studioLibraryCostView(this.config).provider === 'fal' &&
        studioLibraryCostView(this.config).generationEnabled &&
        !!has(actor, 'product_intake.gemini_studio'),
      defaultProviderStatus: 'NOT YET GENERATED',
      localPreviewPolicy: 'LOCAL PREVIEW — UNAPPROVED MASK / EMPLOYEE REVIEW REQUIRED',
      automaticSelection: false,
    };
  }
  async localStudioReviewPreview(
    photoId: string,
    templateId: string,
    version: number,
    actor: AuthenticatedUser,
  ) {
    this.enabled();
    const index = await readRealStudioReview(this.config).catch(() =>
        fail('REAL_STUDIO_REVIEW_DISABLED', 'التقييم الخاص غير متاح', 404),
      ),
      photo = index.photos.find((p) => p.photoId === photoId);
    if (!photo?.sessionId || !photo.sourceCandidateId)
      fail('REAL_STUDIO_PHOTO_NOT_READY', 'راجع العزل أو أعد التصوير', 409);
    const session = await this.owned(photo!.sessionId!, actor);
    this.current(session, photo!.clientImageId!);
    if (!photo!.previewAllowed)
      fail(
        'REAL_STUDIO_RECAPTURE_OR_REVIEW',
        'تعذر إنشاء معاينة محلية دقيقة لأن عزل المنتج يحتاج مراجعة. الصورة الأصلية محفوظة.',
        409,
      );
    let template: ReturnType<typeof studioTemplate>;
    try {
      template = studioTemplate(templateId, version);
      validateStudioSelection(
        {
          templateId,
          templateVersion: version,
          processingMode: 'FAITHFUL_COMPOSITE',
          sourceKind: photo!.sourceKind,
          evidenceReviewed: false,
        },
        photo!.placement,
      );
    } catch {
      fail('STUDIO_MODE_INCOMPATIBLE', 'القالب لا يلائم هذا المصدر؛ لا تبديل تلقائي', 400);
    }
    const candidate = await this.db.productImageEnhancementCandidate.findUnique({
      where: { id: photo!.sourceCandidateId! },
      include: { job: { include: { image: { include: { asset: true } } } }, maskAsset: true },
    });
    if (
      !candidate ||
      candidate.job.sessionId !== session.id ||
      candidate.job.mode !== 'NEURAL_BACKGROUND_REMOVE' ||
      candidate.job.status !== 'COMPLETED' ||
      !candidate.maskAsset?.intakePrivate ||
      candidate.job.image.clientImageId !== session.selectedImageKey ||
      candidate.job.sourceHash !== photo!.sourceHash
    )
      fail('IMAGE_SOURCE_CHANGED', 'تغيّر المصدر؛ حدّث المراجعة', 409);
    if (this.localStudioPreviews >= 1)
      fail('IMAGE_PREVIEW_BUSY', 'المعاينة المحلية مشغولة؛ حاول بعد قليل', 429);
    this.localStudioPreviews++;
    try {
      const source = await this.read(candidate!.job.image.asset!.key),
        mask = await this.read(candidate!.maskAsset!.key);
      if (
        hash(Buffer.concat([Buffer.from(source.mime), source.bytes])) !== photo!.sourceHash ||
        hash(mask.bytes) !== photo!.maskHash
      )
        fail('IMAGE_SOURCE_CHANGED', 'تغيّرت بصمة الصورة أو القناع', 409);
      const result = await isolatedEnhancement({
        bytes: source.bytes,
        mime: source.mime,
        mask: mask.bytes,
        mode: 'PRODUCT_STUDIO_FAITHFUL',
        background: 'WHITE',
        matting: false,
        studioProfile: studioLibraryProfile(template!, 'FAITHFUL_COMPOSITE'),
        placement: photo!.placement,
      });
      this.current(await this.owned(session.id, actor), photo!.clientImageId!);
      const bytes = await sharp(result.png, { limitInputPixels: 12000000 })
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer();
      return {
        photoId,
        clientImageId: photo!.clientImageId,
        label: 'LOCAL PREVIEW',
        realFal: false,
        employeeApproval: 'PENDING',
        selectableCandidate: false,
        mimeType: 'image/webp',
        base64: bytes.toString('base64'),
        lineage: {
          templateId: template!.id,
          templateVersion: template!.version,
          processingMode: 'FAITHFUL_COMPOSITE',
          sourceHash: photo!.sourceHash,
          maskHash: photo!.maskHash,
          sourceCandidateId: photo!.sourceCandidateId,
          placement: photo!.placement,
        },
        diagnostics: result.details,
        warnings: [
          ...result.warnings,
          'LOCAL_PREVIEW_NOT_PROVIDER_OUTPUT',
          'UNAPPROVED_PREVIEW_CANNOT_BE_SELECTED',
        ],
      };
    } finally {
      this.localStudioPreviews--;
    }
  }
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly budget: RecognitionBudgetService,
    private readonly provider: ImageEditingProvider,
    private readonly permissions: PermissionResolverService,
  ) {}
  private enabled() {
    const s = enhancementSettings(this.config);
    if (!s.enabled || !s.local)
      fail('IMAGE_ENHANCEMENT_DISABLED', 'التحسين غير مفعل؛ الصورة الأصلية متاحة', 404);
    return s;
  }
  private async neuralConfig() {
    try {
      const c = segmentationSettings(this.config);
      if (!c || (await stat(c.modelFile)).size !== SEGMENTATION_MODELS[c.model].bytes) return null;
      const manifest = JSON.parse(
        await readFile(
          join(c.runtimeDirectory, 'node_modules/onnxruntime-node/package.json'),
          'utf8',
        ),
      ) as { version?: string };
      if (manifest.version !== SEGMENTATION_RUNTIME_VERSION) return null;
      return c;
    } catch {
      return null;
    } // Missing optional runtime/model must not break manual/CLEAN intake.
  }
  private async owned(
    id: string,
    actor: AuthenticatedUser,
    tx: InventoryTx | PrismaService = this.db,
  ) {
    const s = await tx.productIntakeSession.findUnique({ where: { id } });
    if (!s || (s.createdById !== actor.id && !has(actor, 'product_intake.manage_all')))
      fail('INTAKE_NOT_FOUND', 'Intake not found', 404);
    return s!;
  }
  private current(s: ProductIntakeSession, clientImageId: string) {
    if (s.status !== 'DRAFT' || s.selectedImageKey !== clientImageId)
      fail('IMAGE_SOURCE_CHANGED', 'المسودة أو الصورة تغيّرت؛ أعد تحميلها');
  }
  private studioDisplayMetadata(value: Prisma.JsonValue) {
    const { style, ...safe } = (value ?? {}) as Record<string, Prisma.JsonValue>;
    const template = (
      style as { templateDefinition?: { id: string; version: number; nameAr: string } }
    )?.templateDefinition;
    return {
      ...safe,
      templateSnapshot: template
        ? { id: template.id, version: template.version, nameAr: template.nameAr }
        : null,
    };
  }
  async studioTemplates(id: string, actor: AuthenticatedUser, group?: StudioGroup) {
    const s = await this.owned(id, actor),
      categoryId = (s.approvedMetadata as { categoryId?: unknown })?.categoryId;
    const category =
      typeof categoryId === 'string'
        ? await this.db.category.findFirst({
            where: { id: categoryId, isActive: true },
            select: { id: true, name: true },
          })
        : null;
    const cost = studioLibraryCostView(this.config),
      permitted = !!has(actor, 'product_intake.gemini_studio');
    const source = s.selectedImageKey
      ? await this.db.productIntakeImage.findUnique({
          where: { sessionId_clientImageId: { sessionId: id, clientImageId: s.selectedImageKey } },
        })
      : null;
    const templates = [];
    for (const t of studioCatalog(group)) {
      const generationAllowedModes: string[] = [];
      for (const mode of t.supportedModes) {
        try {
          if (!permitted || !source) throw Error('STUDIO_SOURCE_NOT_READY');
          const cfg = assertStudioLibraryApproved(this.config, {
            templateId: t.id,
            templateVersion: t.version,
            processingMode: mode,
          });
          if (mode === 'GENERATIVE_3D_HERO') {
            await this.studioOriginalSource(id, source.id);
            if (cfg.provider === 'fal')
              assertStudioLibrarySource(
                this.config,
                source.requestHash,
                '',
                mode,
                'ORIGINAL_REFERENCE',
              );
          } else {
            const decision = await this.db.productImageEnhancementDecision.findFirst({
              where: { sessionId: id, imageId: source.id },
              orderBy: { revision: 'desc' },
            });
            const mask = await this.studioSource(
              id,
              source.id,
              decision?.selectedCandidateId ?? '',
            );
            if (cfg.provider === 'fal')
              assertStudioLibrarySource(
                this.config,
                source.requestHash,
                (mask.candidate.processingDetails as { maskHash: string }).maskHash,
                mode,
              );
          }
          generationAllowedModes.push(mode);
        } catch {
          /* browsing remains available; unavailable modes are not actionable */
        }
      }
      templates.push({ ...t, generationAllowedModes });
    }
    return {
      version: 1,
      groups: STUDIO_GROUPS.map((g) => ({ id: g, nameAr: STUDIO_GROUP_LABELS[g], count: 5 })),
      templates,
      totalTemplates: 20,
      suggestion: {
        ...suggestStudioGroup(category?.name),
        catalogCategoryId: category?.id ?? null,
        overridable: true,
        doesNotChangeCatalogCategory: true,
      },
      sourceKinds: STUDIO_SOURCE_KINDS,
      cost: {
        ...cost,
        generationEnabled: cost.generationEnabled && permitted && s.status === 'DRAFT',
      },
      conceptLabel: 'تصوّر محلي توضيحي — ليس نتيجة fal',
      primaryPhotoPolicy: 'GENERATIVE_PROMOTIONAL_NEVER_PRIMARY',
      noAutomaticGeneration: true,
    };
  }
  async studioTemplateDetails(id: string, actor: AuthenticatedUser, templateId: string) {
    const catalog = await this.studioTemplates(id, actor);
    const template = catalog.templates.find((t) => t.id === templateId);
    if (!template) fail('STUDIO_TEMPLATE_VERSION_UNAVAILABLE', 'القالب غير متاح', 404);
    return { template, cost: catalog.cost, conceptLabel: catalog.conceptLabel };
  }
  private async studioSource(
    id: string,
    imageId: string,
    candidateId: string,
    mediaRevision?: number,
    tx: InventoryTx | PrismaService = this.db,
  ) {
    const s = await tx.productIntakeSession.findUniqueOrThrow({ where: { id } });
    const c = await tx.productImageEnhancementCandidate.findFirst({
      where: {
        id: candidateId,
        job: { sessionId: id, imageId, mode: 'NEURAL_BACKGROUND_REMOVE', status: 'COMPLETED' },
      },
      include: { asset: true, maskAsset: true, job: true },
    });
    const decision = await tx.productImageEnhancementDecision.findFirst({
      where: { sessionId: id, imageId },
      orderBy: { revision: 'desc' },
    });
    if (
      s.status !== 'DRAFT' ||
      (mediaRevision !== undefined && s.mediaRevision !== mediaRevision) ||
      !c?.maskAsset?.intakePrivate ||
      c.maskAsset.intakeProductId ||
      !c.asset.intakePrivate ||
      c.asset.intakeProductId ||
      c.qualityStatus !== 'REVIEW_REQUIRED' ||
      decision?.selectedCandidateId !== c.id ||
      !/^[a-f0-9]{64}$/.test(
        String((c.processingDetails as { maskHash?: string })?.maskHash ?? ''),
      ) ||
      (c.warnings as string[]).some((w) =>
        [
          'MASK_AMBIGUOUS_KEEP_OR_RECAPTURE',
          'SOURCE_BOUNDARY_PRODUCT_MAY_ALREADY_BE_CLIPPED',
        ].includes(w),
      )
    )
      fail(
        'STUDIO_APPROVED_MASK_REQUIRED',
        'اعتمد عزلاً صحيحاً وكاملاً أولاً؛ العزل الرديء يحتاج إعادة تصوير',
        409,
      );
    return { candidate: c!, decisionId: decision!.id, mediaRevision: s.mediaRevision };
  }
  private async studioOriginalSource(
    id: string,
    imageId: string,
    mediaRevision?: number,
    tx: InventoryTx | PrismaService = this.db,
  ) {
    const s = await tx.productIntakeSession.findUniqueOrThrow({ where: { id } });
    const i = await tx.productIntakeImage.findUnique({
      where: { id: imageId },
      include: { asset: true },
    });
    if (
      s.status !== 'DRAFT' ||
      !i ||
      i.sessionId !== id ||
      s.selectedImageKey !== i.clientImageId ||
      (mediaRevision !== undefined && s.mediaRevision !== mediaRevision) ||
      i.status !== 'READY' ||
      !i.asset?.intakePrivate ||
      i.asset.intakeProductId ||
      !/^[a-f0-9]{64}$/.test(i.requestHash)
    )
      fail(
        'STUDIO_ORIGINAL_REFERENCE_INVALID',
        'الصورة الأصلية غير متاحة أو تغيّرت؛ أعد المراجعة',
        409,
      );
    return {
      mediaRevision: s.mediaRevision,
      originalAssetId: i!.assetId,
      sourceHash: i!.requestHash,
    };
  }
  private async studioJobSource(
    j: { sessionId: string; imageId: string; parameters: Prisma.JsonValue },
    tx: InventoryTx | PrismaService = this.db,
  ) {
    const p = j.parameters as {
      referenceKind?: string;
      sourceCandidateId: string;
      sourceMediaRevision: number;
      originalAssetId?: string;
      originalReferenceReviewed?: boolean;
      sourceWarningsReviewed?: boolean;
      studioSelection?: StudioSelection;
    };
    if (p.referenceKind === 'ORIGINAL_REFERENCE') {
      if (
        p.studioSelection?.processingMode !== 'GENERATIVE_3D_HERO' ||
        p.originalReferenceReviewed !== true ||
        p.sourceWarningsReviewed !== true
      )
        fail('STUDIO_ORIGINAL_REFERENCE_HERO_ONLY', 'راجع طبيعة الصورة الدعائية والأصل أولاً', 400);
      const current = await this.studioOriginalSource(
        j.sessionId,
        j.imageId,
        p.sourceMediaRevision,
        tx,
      );
      if (current.originalAssetId !== p.originalAssetId)
        fail('IMAGE_SOURCE_CHANGED', 'تغيّر الأصل', 409);
      return;
    }
    await this.studioSource(j.sessionId, j.imageId, p.sourceCandidateId, p.sourceMediaRevision, tx);
  }
  async start(id: string, dto: Start, actor: AuthenticatedUser) {
    const settings = this.enabled(),
      studio = isStudioMode(dto.mode),
      library = isLibraryStudioMode(dto.mode),
      premium = dto.mode === PREMIUM_3D_MODE,
      ai = dto.mode === 'AI_ENHANCE',
      neural = dto.mode === 'NEURAL_BACKGROUND_REMOVE',
      generation = dto.generation ?? 0,
      background = dto.background ?? 'WHITE';
    const selection = dto.studioSelection
      ? {
          templateId: dto.studioSelection.templateId,
          templateVersion: dto.studioSelection.templateVersion,
          processingMode: dto.studioSelection.processingMode,
          sourceKind: dto.studioSelection.sourceKind,
          evidenceReviewed: dto.studioSelection.evidenceReviewed === true,
        }
      : undefined;
    if (
      library &&
      (!selection ||
        studioJobMode(selection.processingMode) !== dto.mode ||
        dto.stylePreset ||
        generation !== 0)
    )
      fail('STUDIO_SELECTION_REQUIRED', 'اختر القالب والنسخة والوضع صراحة؛ لا إعادة تلقائية', 400);
    if (!library && selection)
      fail('STUDIO_MODE_INCOMPATIBLE', 'Template selection requires its explicit studio mode', 400);
    const generative = premium || (library && selection?.processingMode === 'GENERATIVE_3D_HERO');
    const originalReference = dto.referenceKind === 'ORIGINAL_REFERENCE';
    if (
      originalReference &&
      (!library ||
        !generative ||
        dto.originalReferenceReviewed !== true ||
        dto.sourceWarningsReviewed !== true ||
        dto.sourceCandidateId ||
        dto.maskReviewed)
    )
      fail(
        'STUDIO_ORIGINAL_REFERENCE_HERO_ONLY',
        'الأصل مرجع دعائي فقط؛ راجع حدود اللقطة وهوية العبوة ولا ترسل قناعاً بديلاً',
        400,
      );
    if (
      !originalReference &&
      (dto.originalReferenceReviewed != null || dto.sourceWarningsReviewed != null)
    )
      fail('STUDIO_REFERENCE_SELECTION_INVALID', 'اختر مرجع الصورة صراحة', 400);
    const neuralConfig = neural ? await this.neuralConfig() : null;
    if (neural && !neuralConfig)
      fail('SEGMENTATION_UNAVAILABLE_KEEP_ORIGINAL', 'العزل المحلي غير متاح؛ الأصل محفوظ', 400);
    if (dto.foregroundRegion) {
      if (!neural)
        fail('SEGMENTATION_REGION_INVALID', 'Region only applies to neural segmentation', 400);
      try {
        validateForegroundRegion(dto.foregroundRegion);
      } catch {
        fail('SEGMENTATION_REGION_INVALID', 'Invalid foreground region', 400);
      }
    }
    if (dto.stylePreset && !studio)
      fail('STUDIO_PRESET_INVALID', 'Preset applies only to studio styling', 400);
    if (premium !== (dto.stylePreset === PREMIUM_3D_STYLE))
      fail(
        'PREMIUM_3D_MODE_MISMATCH',
        'Generative 3D uses its separate mode and fixed preset',
        400,
      );
    if ((premium && generation !== 0) || (!generative && dto.generativeProductApproved != null))
      fail(
        'PREMIUM_3D_INITIAL_ONLY',
        'Only one explicit initial generative request; no regeneration',
        400,
      );
    if (
      premium &&
      (dto.generativeProductApproved !== true || dto.placement || dto.placementReviewed != null)
    )
      fail(
        'PREMIUM_3D_EXPLICIT_CONSENT_REQUIRED',
        'Acknowledge full-product generation, not preserved-pixel composition',
        400,
      );
    if (
      library &&
      generative &&
      (dto.generativeProductApproved !== true || dto.placement || dto.placementReviewed != null)
    )
      fail(
        'STUDIO_GENERATIVE_CONSENT_REQUIRED',
        'هذا عرض دعائي يعيد رسم المنتج ولا يستبدل الصورة الحقيقية',
        400,
      );
    if ((dto.placement || dto.placementReviewed != null) && !studio)
      fail('TABLETOP_PLACEMENT_INVALID', 'Placement applies only to studio styling', 400);
    const studioConfig = (() => {
      if (!studio) return null;
      try {
        return library
          ? assertStudioLibraryApproved(this.config, selection!)
          : assertStudioApproved(this.config, dto.stylePreset);
      } catch (e) {
        const code =
          e instanceof Error && /^[A-Z0-9_]+$/.test(e.message)
            ? e.message
            : 'STUDIO_CONFIG_NOT_APPROVED';
        fail(
          code,
          'القالب أو التوليد غير متاح؛ الأصل محفوظ',
          code === 'STUDIO_GENERATION_DISABLED' ? 404 : 400,
        );
      }
    })();
    if (studioConfig?.profile.placementRecipe && dto.placementReviewed !== true)
      fail(
        'TABLETOP_PLACEMENT_REVIEW_REQUIRED',
        'راجع وضع العبوة وزاوية التصوير أولاً؛ لا تُخترع زاوية جديدة',
        400,
      );
    let placement: TabletopPlacement | undefined;
    if (studioConfig?.profile.placementRecipe) {
      try {
        placement = validateTabletopPlacement(dto.placement);
      } catch {
        fail('TABLETOP_PLACEMENT_INVALID', 'Invalid reviewed tabletop placement', 400);
      }
    }
    if (library) {
      try {
        validateStudioSelection(selection!, placement);
      } catch (e) {
        fail(
          e instanceof Error && /^[A-Z0-9_]+$/.test(e.message)
            ? e.message
            : 'STUDIO_SELECTION_INVALID',
          'القالب أو الوضع لا يناسب معلومات الصورة؛ راجعها أو أعد التصوير',
          400,
        );
      }
    }
    if (studio && !has(actor, 'product_intake.gemini_studio'))
      fail('PERMISSION_DENIED', 'Gemini styling permission required', 403);
    if (
      studio &&
      ((!originalReference && (!dto.sourceCandidateId || dto.maskReviewed !== true)) ||
        (studioConfig!.provider !== 'mock' && dto.privateTransferApproved !== true))
    )
      fail(
        'STUDIO_REVIEW_AND_CONSENT_REQUIRED',
        'راجع العزل ووافق على نقل الصورة المحددة قبل المتابعة',
        400,
      );
    const parameters: Prisma.InputJsonObject = dto.foregroundRegion
      ? {
          foregroundRegion: {
            x: dto.foregroundRegion.x,
            y: dto.foregroundRegion.y,
            width: dto.foregroundRegion.width,
            height: dto.foregroundRegion.height,
          },
        }
      : {};
    const recipe = library
      ? STUDIO_LIBRARY_RECIPE
      : premium
        ? PREMIUM_3D_RECIPE
        : studio
          ? STUDIO_RECIPE
          : neural
            ? SEGMENTATION_RECIPE
            : ENHANCEMENT_RECIPE;
    if (dto.mode !== 'CLEAN' && !neural && !studio && !settings.segmentation)
      fail('IMAGE_MATTING_DISABLED', 'إزالة الخلفية غير مفعلة؛ استخدم التحسين المحلي', 400);
    if (!ai && !studio && generation !== 0)
      fail('IMAGE_REGEN_INVALID', 'Local recipes are deterministic', 400);
    if (ai) {
      if (!settings.ai) fail('IMAGE_AI_DISABLED', 'التعديل المدفوع غير مفعل', 404);
      if (!has(actor, 'product_intake.enhance_paid'))
        fail('PERMISSION_DENIED', 'Image editing permission required', 403);
      if (settings.provider === 'gemini')
        fail('IMAGE_GEMINI_ADAPTER_UNVERIFIED', 'Optional provider not enabled', 400);
      assertEditingApproved(this.config);
    }
    const provider = studio ? studioConfig!.provider : ai ? settings.provider : 'local',
      model = studio
        ? studioConfig!.model
        : neural
          ? neuralConfig!.model
          : ai
            ? settings.model
            : 'sharp',
      revision = studio
        ? studioConfig!.revision
        : neural
          ? SEGMENTATION_MODELS[neuralConfig!.model].sha256
          : ai
            ? settings.revision
            : 'deterministic-v1';
    // Preserve old request hash exactly when the optional region is absent.
    const requestHash = hash(
      JSON.stringify([
        dto.clientImageId,
        dto.mode,
        background,
        generation,
        ...(dto.stylePreset ? [dto.stylePreset] : []),
        ...(placement ? [placement, dto.placementReviewed] : []),
        ...(premium ? [dto.generativeProductApproved] : []),
        ...(library ? [selection, dto.generativeProductApproved ?? false] : []),
        ...(dto.foregroundRegion ? [parameters] : []),
        ...(studio
          ? [
              dto.sourceCandidateId,
              dto.maskReviewed,
              dto.privateTransferApproved ?? false,
              ...(originalReference
                ? [dto.referenceKind, dto.originalReferenceReviewed, dto.sourceWarningsReviewed]
                : []),
            ]
          : []),
      ]),
    );
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProductIntakeSession" WHERE id=${id} FOR UPDATE`;
      const session = await this.owned(id, actor, tx);
      const old = await tx.productImageEnhancementRequest.findUnique({
        where: { sessionId_requestKey: { sessionId: id, requestKey: dto.requestKey } },
      });
      if (old) {
        if (old.requestHash !== requestHash)
          fail('IMAGE_KEY_CONFLICT', 'Request key has a different payload');
        return;
      }
      this.current(session, dto.clientImageId);
      const source = await tx.productIntakeImage.findUnique({
        where: { sessionId_clientImageId: { sessionId: id, clientImageId: dto.clientImageId } },
      });
      if (source?.status !== 'READY' || !source.assetId)
        fail('IMAGE_SOURCE_NOT_READY', 'Original upload required', 400);
      if (studio && originalReference) {
        const parent = await this.studioOriginalSource(id, source!.id, undefined, tx);
        if (studioConfig!.provider === 'fal')
          assertStudioLibrarySource(
            this.config,
            source!.requestHash,
            '',
            selection!.processingMode,
            'ORIGINAL_REFERENCE',
          );
        Object.assign(parameters, {
          ...parent,
          referenceKind: 'ORIGINAL_REFERENCE',
          originalReferenceReviewed: true,
          sourceWarningsReviewed: true,
          sourceMediaRevision: parent.mediaRevision,
          styleHash: studioConfig!.styleHash,
          style: studioConfig!.profile,
          studioSelection: selection,
          promptHash: assertStudioLibraryApproved(this.config, selection!).promptHash,
          systemVersion: STUDIO_SYSTEM_VERSION,
          mediaRole: 'AI_PROMOTIONAL',
          generativeProductApproved: true,
          privateTransferApproved: dto.privateTransferApproved === true,
          sourceWarnings: [
            'ORIGINAL_REFERENCE_NOT_PIXEL_PRESERVATION',
            'PRESERVE_PHOTOGRAPHED_PACKAGING_NOT_PRINTED_ILLUSTRATION',
            'CHECK_CROPPED_OBSCURED_OR_INCOMPLETE_SOURCE',
          ],
        });
      } else if (studio) {
        const parent = await this.studioSource(
          id,
          source!.id,
          dto.sourceCandidateId!,
          undefined,
          tx,
        );
        if (studioConfig!.provider === 'fal') {
          if (library)
            assertStudioLibrarySource(
              this.config,
              source!.requestHash,
              (parent.candidate.processingDetails as { maskHash: string }).maskHash,
            );
          else
            assertFalStudioSource(
              this.config,
              source!.requestHash,
              (parent.candidate.processingDetails as { maskHash: string }).maskHash,
            );
          if (generation !== 0)
            fail(
              'FAL_PILOT_INITIAL_ONLY',
              'This pilot allows one initial request per image; no regeneration',
              400,
            );
        }
        Object.assign(parameters, {
          sourceCandidateId: parent.candidate.id,
          maskAssetId: parent.candidate.maskAssetId,
          sourceCandidateHash: parent.candidate.contentHash,
          sourceDecisionId: parent.decisionId,
          sourceMediaRevision: parent.mediaRevision,
          styleHash: studioConfig!.styleHash,
          style: studioConfig!.profile,
          ...(library
            ? {
                studioSelection: selection,
                promptHash: assertStudioLibraryApproved(this.config, selection!).promptHash,
                systemVersion: STUDIO_SYSTEM_VERSION,
                mediaRole: generative ? 'AI_PROMOTIONAL' : 'FACTUAL',
                generativeProductApproved: generative && dto.generativeProductApproved === true,
              }
            : {}),
          ...(premium
            ? { renderPolicy: 'GENERATIVE_PRODUCT_3D', generativeProductApproved: true }
            : {}),
          ...(dto.stylePreset ? { stylePreset: dto.stylePreset } : {}),
          ...(placement ? { placementRequest: { ...placement }, placementReviewed: true } : {}),
          maskRecipe: parent.candidate.job.recipeVersion,
          maskModelRevision: parent.candidate.job.modelRevision,
          maskHash: (parent.candidate.processingDetails as { maskHash: string }).maskHash,
          maskReviewed: true,
          privateTransferApproved: dto.privateTransferApproved === true,
        });
      }
      const identityKey = hash(
        JSON.stringify([
          id,
          source!.id,
          source!.requestHash,
          dto.mode,
          background,
          recipe,
          provider,
          model,
          revision,
          studio ? studioConfig!.profile.promptVersion : EDIT_PROMPT_VERSION,
          generation,
          ...(dto.foregroundRegion ? [parameters] : []),
          ...(studio ? [parameters] : []),
        ]),
      );
      let job = await tx.productImageEnhancementJob.findUnique({ where: { identityKey } });
      if (!job) {
        if (
          studio &&
          ((await tx.productImageEnhancementJob.count({
            where: {
              imageId: source!.id,
              mode: dto.mode,
              status: { in: ['PENDING', 'PROCESSING', 'UNKNOWN'] },
            },
          })) ||
            (await tx.recognitionUsage.count({
              where: {
                purpose: 'IMAGE_EDIT',
                enhancementJob: { imageId: source!.id, mode: dto.mode },
                status: { in: ['RESERVED', 'UNKNOWN'] },
              },
            })))
        )
          fail(
            'IMAGE_REGEN_BLOCKED',
            'Resolve previous editing work before requesting another candidate',
          );
        if (
          (ai || studio) &&
          (await tx.productImageEnhancementJob.count({
            where: { imageId: source!.id, mode: dto.mode },
          })) >= 3
        )
          fail('IMAGE_REGEN_LIMIT', 'At most three explicit editing generations per capture');
        await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(660071)) q`;
        if (
          (await tx.productImageEnhancementJob.count({
            where: { status: { in: ['PENDING', 'PROCESSING'] } },
          })) >= 100
        )
          fail('IMAGE_QUEUE_LIMIT', 'Image queue capacity reached', 429);
        const [pending, total] = await Promise.all([
          tx.productImageEnhancementJob.count({
            where: { actorId: actor.id, status: { in: ['PENDING', 'PROCESSING'] } },
          }),
          tx.productImageEnhancementJob.count({ where: { sessionId: id } }),
        ]);
        if (pending >= 10 || total >= 32)
          fail('IMAGE_QUEUE_LIMIT', 'Too many pending image requests', 429);
        if (generation > 0) {
          const previous = await tx.productImageEnhancementJob.findFirst({
            where: {
              sessionId: id,
              imageId: source!.id,
              mode: dto.mode,
              generation: generation - 1,
            },
          });
          if (!previous || ['PENDING', 'PROCESSING', 'UNKNOWN'].includes(previous.status))
            fail(
              'IMAGE_REGEN_BLOCKED',
              'Resolve the preceding request before explicit regeneration',
            );
        }
        job = await tx.productImageEnhancementJob.create({
          data: {
            sessionId: id,
            imageId: source!.id,
            actorId: actor.id,
            identityKey,
            sourceHash: source!.requestHash,
            mode: dto.mode,
            background,
            recipeVersion: recipe,
            provider,
            model,
            modelRevision: revision,
            promptVersion: studio ? studioConfig!.profile.promptVersion : EDIT_PROMPT_VERSION,
            generation,
            parameters,
          },
        });
      }
      await tx.productImageEnhancementRequest.create({
        data: { sessionId: id, jobId: job.id, requestKey: dto.requestKey, requestHash },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId: actor.id,
          action: 'product_intake.image_requested',
          entityType: 'ProductIntakeSession',
          entityId: id,
          metadata: {
            jobId: job.id,
            mode: dto.mode,
            generation,
            cacheHit: job.status === 'COMPLETED',
          },
        },
      });
    });
    return this.status(id, actor);
  }
  async status(id: string, actor: AuthenticatedUser) {
    const s = await this.owned(id, actor);
    const jobs = await this.db.productImageEnhancementJob.findMany({
      where: { sessionId: id, image: { clientImageId: s.selectedImageKey ?? '' } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: {
        candidate: {
          include: {
            asset: {
              select: {
                id: true,
                mimeType: true,
                intakePrivate: true,
                intakeProductId: true,
                imageJobs: {
                  where: { recipeVersion: IMAGE_RECIPE },
                  select: { status: true, errorCode: true },
                },
                variants: {
                  where: { recipeVersion: IMAGE_RECIPE },
                  select: {
                    variantType: true,
                    format: true,
                    width: true,
                    height: true,
                    fileSize: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const decision = await this.db.productImageEnhancementDecision.findFirst({
      where: { sessionId: id, image: { clientImageId: s.selectedImageKey ?? '' } },
      orderBy: { revision: 'desc' },
    });
    const settings = enhancementSettings(this.config);
    const promotional = jobs
      .filter(
        (j) => j.candidate && isPromotionalCandidate({ mediaRole: j.candidate.mediaRole, job: j }),
      )
      .map((j) => j.candidate!.id);
    const approvals = promotional.length
      ? await this.db.$queryRaw<{ targetCandidateId: string; action: string }[]>(
          Prisma.sql`SELECT DISTINCT ON ("targetCandidateId") "targetCandidateId",action FROM "ProductImageEnhancementDecision" WHERE "sessionId"=${id} AND "targetCandidateId" IN (${Prisma.join(promotional)}) ORDER BY "targetCandidateId",revision DESC LIMIT 32`,
        )
      : [];
    const selectedJob = decision?.selectedCandidateId
      ? jobs.find((j) => j.candidate?.id === decision.selectedCandidateId)
      : undefined;
    const factualSelected =
      selectedJob &&
      isPromotionalCandidate({ mediaRole: selectedJob.candidate!.mediaRole, job: selectedJob })
        ? null
        : (decision?.selectedCandidateId ?? null);
    return {
      clientImageId: s.selectedImageKey,
      mediaRevision: s.mediaRevision,
      decisionRevision: s.imageDecisionRevision,
      businessRevision: s.revision,
      selectedCandidateId: factualSelected,
      approvedPromotionalCandidateIds: approvals
        .filter((a) => a.action === 'ACCEPT')
        .map((a) => a.targetCandidateId),
      capabilities: {
        geminiStudio:
          settings.enabled &&
          settings.local &&
          studioSettings(this.config).enabled &&
          !!has(actor, 'product_intake.gemini_studio'),
        studioProvider: studioSettings(this.config).provider,
        studioStyle: {
          name: studioSettings(this.config).profile.name,
          revision: studioSettings(this.config).profile.revision,
          approved: studioSettings(this.config).profile.approved,
        },
        localNeutralDefault: true,
        studioLibraryAvailable: true,
        tabletopPlacementRequired: true,
        tabletopPlacementRecipe: 'rezona-tabletop-native-grounding-v2',
        tabletopLiveRequiresNewApproval: true,
        studioMaxRegenerations: studioSettings(this.config).provider === 'fal' ? 0 : 2,
        studioPresets: [
          ...TABLETOP_STYLES,
          { label: PREMIUM_3D_LABEL, profile: PREMIUM_3D_PROFILE },
        ].map((s) => ({
          id: s.profile.name,
          label: s.label,
          revision: s.profile.revision,
          paid: studioSettings(this.config).provider !== 'mock',
          enabled:
            ['mock', 'fal'].includes(studioSettings(this.config).provider) &&
            studioSettings(this.config, s.profile.name).enabled &&
            !!has(actor, 'product_intake.gemini_studio'),
          reviewRequired: true,
          generativeProduct: s.profile.name === PREMIUM_3D_STYLE,
        })),
        enabled: settings.enabled && settings.local,
        localMatting: settings.segmentation,
        neuralSegmentation: settings.enabled && settings.local && !!(await this.neuralConfig()),
        ai:
          settings.ai &&
          settings.provider !== 'gemini' &&
          !!has(actor, 'product_intake.enhance_paid'),
        provider: settings.provider,
      },
      jobs: jobs.map((j) => ({
        id: j.id,
        mode: j.mode,
        generation: j.generation,
        status: j.status,
        errorCode: j.errorCode,
        provider: j.provider,
        ...(isStudioMode(j.mode)
          ? {
              lineage: isLibraryStudioMode(j.mode)
                ? this.studioDisplayMetadata(j.parameters)
                : j.parameters,
            }
          : {}),
        candidate: j.candidate
          ? {
              id: j.candidate.id,
              qualityStatus: j.candidate.qualityStatus,
              mediaRole: isPromotionalCandidate({ mediaRole: j.candidate.mediaRole, job: j })
                ? 'AI_PROMOTIONAL'
                : 'FACTUAL',
              warnings: j.candidate.warnings,
              contentHash: j.candidate.contentHash,
              width: j.candidate.width,
              height: j.candidate.height,
              maskAvailable: !!j.candidate.maskAssetId,
              processingDetails: isLibraryStudioMode(j.mode)
                ? this.studioDisplayMetadata(j.candidate.processingDetails)
                : j.candidate.processingDetails,
              // Owned, read-only processing evidence. Never expose private storage keys/URLs.
              media: {
                assetId: j.candidate.asset.id,
                mimeType: j.candidate.asset.mimeType,
                private: j.candidate.asset.intakePrivate,
                associatedProductId: j.candidate.asset.intakeProductId,
                optimization: {
                  recipeVersion: IMAGE_RECIPE,
                  status: j.candidate.asset.imageJobs[0]?.status ?? 'NOT_SCHEDULED',
                  errorCode: j.candidate.asset.imageJobs[0]?.errorCode ?? null,
                  variantCount: j.candidate.asset.variants.length,
                  variants: j.candidate.asset.variants,
                },
              },
            }
          : null,
      })),
    };
  }
  async usage(actor: AuthenticatedUser) {
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const where = {
      purpose: 'IMAGE_EDIT',
      createdAt: { gte: since },
      status: { not: 'SYNTHETIC_LEDGER_TEST' },
      ...(actor.isOwner || actor.role === 'OWNER' ? {} : { actorId: actor.id }),
    };
    const [totals, providers, unknown] = await Promise.all([
      this.db.recognitionUsage.aggregate({
        where,
        _count: true,
        _sum: { reservedUsd: true, committedUsd: true, estimatedUsd: true },
      }),
      this.db.recognitionUsage.groupBy({
        by: ['provider', 'model', 'status'],
        where,
        _count: true,
        _sum: { committedUsd: true },
      }),
      this.db.recognitionUsage.count({ where: { ...where, status: 'UNKNOWN' } }),
    ]);
    return {
      period: 'UTC_MONTH',
      scope: actor.isOwner || actor.role === 'OWNER' ? 'ALL' : 'SELF',
      totals,
      providers,
      unknown,
      actualBilling: 'NOT_AVAILABLE',
      committedMeaning: 'CONSERVATIVE_RESERVATIONS_NOT_INVOICE_CHARGES',
      automaticFallback: false,
    };
  }
  async decide(id: string, dto: Decision, actor: AuthenticatedUser) {
    if (!dto.reviewed) fail('IMAGE_REVIEW_REQUIRED', 'Compare against the original first', 400);
    const requestHash = hash(
      JSON.stringify([
        dto.clientImageId,
        dto.expectedRevision,
        dto.expectedMediaRevision,
        dto.action,
        dto.candidateId ?? null,
        dto.reviewed,
        ...(dto.sceneReviewed !== undefined || dto.meaningfulImprovement !== undefined
          ? [dto.sceneReviewed, dto.meaningfulImprovement]
          : []),
        ...(dto.identityReviewed !== undefined ||
        dto.premiumSceneReviewed !== undefined ||
        dto.generativeNatureAcknowledged !== undefined
          ? [dto.identityReviewed, dto.premiumSceneReviewed, dto.generativeNatureAcknowledged]
          : []),
        ...(dto.materialMismatchObserved !== undefined ? [dto.materialMismatchObserved] : []),
        ...(dto.expectedDecisionRevision !== undefined ? [dto.expectedDecisionRevision] : []),
      ]),
    );
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProductIntakeSession" WHERE id=${id} FOR UPDATE`;
      const s = await this.owned(id, actor, tx);
      const old = await tx.productImageEnhancementDecision.findUnique({
        where: { sessionId_requestKey: { sessionId: id, requestKey: dto.requestKey } },
      });
      if (old) {
        if (old.requestHash !== requestHash)
          fail('IMAGE_KEY_CONFLICT', 'Decision key has a different payload');
        return;
      }
      this.current(s, dto.clientImageId);
      if (s.revision !== dto.expectedRevision || s.mediaRevision !== dto.expectedMediaRevision)
        fail('IMAGE_REVISION_CONFLICT', 'The draft or image selection changed');
      if (
        dto.expectedDecisionRevision !== undefined &&
        dto.expectedDecisionRevision !== (s.imageDecisionRevision ?? s.mediaRevision)
      )
        fail('IMAGE_REVISION_CONFLICT', 'The image review changed; reload', 409);
      const image = await tx.productIntakeImage.findUniqueOrThrow({
        where: { sessionId_clientImageId: { sessionId: id, clientImageId: dto.clientImageId } },
      });
      const previous = await tx.productImageEnhancementDecision.findFirst({
        where: { sessionId: id, imageId: image.id },
        orderBy: { revision: 'desc' },
      });
      let selected = previous?.selectedCandidateId ?? null;
      if (dto.action === 'ORIGINAL') selected = null;
      else {
        const candidate = dto.candidateId
          ? await tx.productImageEnhancementCandidate.findUnique({
              where: { id: dto.candidateId },
              include: { job: true, asset: true },
            })
          : null;
        if (
          !candidate ||
          candidate.job.sessionId !== id ||
          candidate.job.imageId !== image.id ||
          candidate.job.status !== 'COMPLETED' ||
          candidate.qualityStatus !== 'REVIEW_REQUIRED' ||
          !candidate.asset.intakePrivate ||
          candidate.asset.intakeProductId
        )
          fail('IMAGE_CANDIDATE_NOT_FOUND', 'Candidate is unavailable', 404);
        if (dto.action === 'ACCEPT') {
          const promo = isPromotionalCandidate(candidate!);
          if (promo) {
            if (dto.materialMismatchObserved !== false)
              fail(
                'STUDIO_MATERIAL_MISMATCH_REJECT',
                'أي اختلاف جوهري بالشكل أو النص أو المواصفات يستوجب الرفض؛ لا يمكن اعتماده',
                400,
              );
            if (dto.expectedDecisionRevision === undefined)
              fail('STUDIO_REVIEW_REVISION_REQUIRED', 'حدّث واجهة مراجعة الصور أولاً', 400);
          }
          if (isGenerativeImageMode(candidate!.job.mode)) {
            try {
              requirePremium3dReview(dto);
            } catch {
              fail(
                'PREMIUM_3D_STRICT_REVIEW_REQUIRED',
                'Review logo/text, identity, shape/colors, black/gold support surface, quality/value and generative marketing nature',
                400,
              );
            }
          }
          if (
            isLibraryStudioMode(candidate!.job.mode) &&
            (dto.sceneReviewed !== true || dto.meaningfulImprovement !== true)
          )
            fail(
              'STUDIO_SCENE_VALUE_REVIEW_REQUIRED',
              'راجع التلامس والسطح والهوية والقيمة قبل الاعتماد',
              400,
            );
          if (
            tabletopStyle((candidate!.job.parameters as { stylePreset?: string }).stylePreset) &&
            (dto.sceneReviewed !== true || dto.meaningfulImprovement !== true)
          )
            fail(
              'STUDIO_SCENE_VALUE_REVIEW_REQUIRED',
              'Confirm no duplicate/props/text/shape defects and a meaningful improvement over local before accepting',
              400,
            );
          if (isStudioMode(candidate!.job.mode)) {
            await this.studioJobSource(
              { sessionId: id, imageId: image.id, parameters: candidate!.job.parameters },
              tx,
            );
          }
          if (!promo) selected = candidate!.id;
          if (this.config.get<boolean>('imageOptimization.enabled') === true)
            await tx.fileAssetImageJob.upsert({
              where: {
                assetId_recipeVersion: { assetId: candidate!.assetId, recipeVersion: IMAGE_RECIPE },
              },
              create: { assetId: candidate!.assetId, recipeVersion: IMAGE_RECIPE },
              update: {},
            });
        } else if (dto.action === 'REJECT' && selected === candidate!.id) selected = null;
      }
      await tx.productImageEnhancementDecision.create({
        data: {
          sessionId: id,
          imageId: image.id,
          actorId: actor.id,
          requestKey: dto.requestKey,
          requestHash,
          action: dto.action,
          targetCandidateId: dto.candidateId,
          selectedCandidateId: selected,
          revision: (s.imageDecisionRevision ?? s.mediaRevision) + 1,
          businessRevision: s.revision,
        },
      });
      await tx.productIntakeSession.update({
        where: { id },
        data: {
          imageDecisionRevision: { increment: 1 },
          ...(selected !== (previous?.selectedCandidateId ?? null) ||
          (dto.action === 'ACCEPT' && selected === dto.candidateId)
            ? { mediaRevision: { increment: 1 } }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId: actor.id,
          action: 'product_intake.image_decided',
          entityType: 'ProductIntakeSession',
          entityId: id,
          metadata: {
            action: dto.action,
            candidateId: dto.candidateId ?? null,
            selectedCandidateId: selected,
            revision: (s.imageDecisionRevision ?? s.mediaRevision) + 1,
            ...(dto.materialMismatchObserved !== undefined
              ? { materialMismatchObserved: dto.materialMismatchObserved }
              : {}),
            ...(dto.identityReviewed !== undefined
              ? {
                  identityReviewed: dto.identityReviewed,
                  premiumSceneReviewed: dto.premiumSceneReviewed ?? false,
                  generativeNatureAcknowledged: dto.generativeNatureAcknowledged ?? false,
                }
              : {}),
          },
        },
      });
    });
    return this.status(id, actor);
  }
  async cancel(id: string, jobId: string, actor: AuthenticatedUser) {
    await this.owned(id, actor);
    await this.db.productImageEnhancementJob.updateMany({
      where: { id: jobId, sessionId: id, status: { in: ['PENDING', 'PROCESSING'] } },
      data: {
        status: 'CANCELLED',
        leaseToken: null,
        completedAt: new Date(),
        errorCode: 'IMAGE_CANCELLED',
      },
    });
    return this.status(id, actor); // Retain originals, outputs, history and potentially billed reservations.
  }
  async retry(id: string, jobId: string, actor: AuthenticatedUser) {
    this.enabled();
    const s = await this.owned(id, actor);
    if (s.status !== 'DRAFT') fail('IMAGE_SOURCE_CHANGED', 'Draft is no longer editable');
    await this.db.productImageEnhancementJob.updateMany({
      where: {
        id: jobId,
        sessionId: id,
        provider: 'local',
        image: { clientImageId: s.selectedImageKey ?? '' },
        status: 'FAILED',
        attempts: { lt: 3 },
      },
      data: { status: 'PENDING', nextDispatchAt: new Date(), errorCode: null },
    });
    return this.status(id, actor);
  }
  private async read(key: string) {
    const object = await storageDeadline(this.storage.getObject(key), (late) =>
        late.stream.destroy(),
      ),
      chunks: Buffer[] = [];
    let length = 0;
    const timer = setTimeout(
      () => object.stream.destroy(new Error('IMAGE_STORAGE_TIMEOUT')),
      15000,
    );
    try {
      if (object.size > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
      for await (const part of object.stream) {
        const b = Buffer.from(part as Uint8Array);
        length += b.length;
        if (length > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
        chunks.push(b);
      }
      return { bytes: Buffer.concat(chunks), mime: object.mimeType };
    } finally {
      clearTimeout(timer);
      object.stream.destroy();
    }
  }
  async preview(
    id: string,
    candidateId: string,
    edge: number,
    actor: AuthenticatedUser,
    mask = false,
  ) {
    await this.owned(id, actor);
    const c = await this.db.productImageEnhancementCandidate.findFirst({
      where: { id: candidateId, job: { sessionId: id } },
      include: { asset: true, maskAsset: true },
    });
    if (!c) fail('IMAGE_CANDIDATE_NOT_FOUND', 'Candidate not found', 404);
    if (this.previews >= 2) fail('IMAGE_PREVIEW_BUSY', 'Try again shortly', 429);
    this.previews++;
    try {
      const asset = mask ? c!.maskAsset : c!.asset;
      if (!asset?.intakePrivate || (mask && asset.intakeProductId))
        fail('IMAGE_CANDIDATE_NOT_FOUND', 'Private preview unavailable', 404);
      const input = await this.read(asset!.key);
      const bytes = await sharp(input.bytes, { limitInputPixels: 12000000 })
        .timeout({ seconds: 12 })
        .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 88 })
        .toBuffer();
      return {
        mimeType: 'image/webp',
        base64: bytes.toString('base64'),
        contentHash: c!.contentHash,
      };
    } finally {
      this.previews--;
    }
  }
  private async authorized(id: string) {
    const j = await this.db.productImageEnhancementJob.findUniqueOrThrow({
      where: { id },
      include: { session: true, image: true },
    });
    if (j.session.status !== 'DRAFT' || j.session.selectedImageKey !== j.image.clientImageId)
      return false;
    const a = await this.db.adminUser.findUnique({ where: { id: j.actorId } });
    if (!a?.isActive || a.status !== 'ACTIVE') return false;
    const p = await this.permissions.forAdmin(a.id),
      owner = a.isOwner || a.role === 'OWNER';
    return (
      (owner || p.includes('product_intake.use')) &&
      (owner || p.includes('products.upload_images')) &&
      (j.session.createdById === a.id || owner || p.includes('product_intake.manage_all')) &&
      (j.mode !== 'AI_ENHANCE' || owner || p.includes('product_intake.enhance_paid')) &&
      (!isStudioMode(j.mode) || owner || p.includes('product_intake.gemini_studio'))
    );
  }
  async recover() {
    const now = new Date();
    // Paid/ambiguous work is never automatically re-dispatched. A crashed native local job is bounded to 3 attempts.
    const jobs = await this.db.productImageEnhancementJob.findMany({
      where: { status: 'PROCESSING', nextDispatchAt: { lte: now } },
      take: 20,
    });
    for (const j of jobs) {
      const paid = j.provider !== 'local';
      await this.db.productImageEnhancementJob.updateMany({
        where: {
          id: j.id,
          status: 'PROCESSING',
          leaseToken: j.leaseToken,
          nextDispatchAt: { lte: now },
        },
        data: {
          status: paid ? 'UNKNOWN' : j.attempts < 3 ? 'PENDING' : 'FAILED',
          leaseToken: null,
          nextDispatchAt: now,
          errorCode: paid ? 'IMAGE_WORKER_OUTCOME_UNKNOWN' : 'IMAGE_WORKER_INTERRUPTED',
        },
      });
    }
    await this.db.recognitionUsage.updateMany({
      where: {
        purpose: 'IMAGE_EDIT',
        status: 'RESERVED',
        createdAt: { lt: new Date(Date.now() - 180000) },
      },
      data: { status: 'UNKNOWN', errorCode: 'IMAGE_WORKER_OUTCOME_UNKNOWN', completedAt: now },
    });
  }
  async process(id: string) {
    const s = enhancementSettings(this.config);
    if (!s.enabled || !s.local) return;
    const lease = randomUUID(),
      start = Date.now();
    const claim = await this.db.$transaction(async (tx) => {
      const queued = await tx.productImageEnhancementJob.findUnique({ where: { id } });
      if (queued?.mode === 'NEURAL_BACKGROUND_REMOVE') {
        // Cross-process/replica concurrency, not just a BullMQ per-process setting.
        await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(660073)) q`;
        if (
          await tx.productImageEnhancementJob.count({
            where: {
              mode: 'NEURAL_BACKGROUND_REMOVE',
              status: 'PROCESSING',
              nextDispatchAt: { gt: new Date() },
            },
          })
        )
          return { count: 0 };
      }
      return tx.productImageEnhancementJob.updateMany({
        where: { id, status: 'PENDING', attempts: { lt: 3 } },
        data: {
          status: 'PROCESSING',
          leaseToken: lease,
          attempts: { increment: 1 },
          startedAt: new Date(),
          nextDispatchAt: new Date(Date.now() + 180000),
        },
      });
    });
    if (!claim.count) return;
    const j = await this.db.productImageEnhancementJob.findUniqueOrThrow({
      where: { id },
      include: { image: { include: { asset: true } } },
    });
    let usageId: string | undefined,
      dispatched = false,
      reported = false;
    let studioUsage: StudioUsage | undefined,
      studioRequestMetadata: Record<string, string | number | string[]> | undefined,
      studioModelVersion: string | undefined,
      studioBilling: FalStudioBilling | undefined;
    try {
      if (!(await this.authorized(id)))
        throw new Error('IMAGE_RECIPIENT_REVOKED_OR_SOURCE_CHANGED');
      const neural = j.mode === 'NEURAL_BACKGROUND_REMOVE';
      const studio = isStudioMode(j.mode),
        library = isLibraryStudioMode(j.mode),
        premium = j.mode === PREMIUM_3D_MODE;
      const selectedPreset = (j.parameters as { stylePreset?: string }).stylePreset;
      const librarySelection = (j.parameters as { studioSelection?: StudioSelection })
        .studioSelection;
      const sc = studio
        ? library
          ? assertStudioLibraryApproved(this.config, librarySelection!)
          : assertStudioApproved(this.config, selectedPreset)
        : null;
      if (
        library &&
        (!librarySelection || studioJobMode(librarySelection.processingMode) !== j.mode)
      )
        throw Error('STUDIO_MODE_INCOMPATIBLE');
      if (library) {
        const params = j.parameters as {
          placementRequest?: TabletopPlacement;
          generativeProductApproved?: boolean;
          promptHash?: string;
        };
        validateStudioSelection(librarySelection!, params.placementRequest);
        if (
          params.promptHash !==
          assertStudioLibraryApproved(this.config, librarySelection!).promptHash
        )
          throw Error('IMAGE_CONFIG_CHANGED');
        if (
          librarySelection!.processingMode === 'GENERATIVE_3D_HERO' &&
          params.generativeProductApproved !== true
        )
          throw Error('STUDIO_GENERATIVE_CONSENT_REQUIRED');
      }
      if (premium !== (selectedPreset === PREMIUM_3D_STYLE))
        throw Error('PREMIUM_3D_MODE_MISMATCH');
      if (
        premium &&
        (j.parameters as { generativeProductApproved?: boolean }).generativeProductApproved !== true
      )
        throw Error('PREMIUM_3D_EXPLICIT_CONSENT_REQUIRED');
      if (studio && sc!.provider === 'fal')
        if (library)
          assertStudioLibrarySource(
            this.config,
            j.sourceHash,
            (j.parameters as { maskHash: string }).maskHash,
            librarySelection!.processingMode,
            (j.parameters as { referenceKind?: string }).referenceKind,
          );
        else
          assertFalStudioSource(
            this.config,
            j.sourceHash,
            (j.parameters as { maskHash: string }).maskHash,
          );
      const sp = j.parameters as {
        sourceCandidateId: string;
        sourceMediaRevision: number;
        styleHash: string;
        referenceKind?: string;
      };
      const neuralConfig = neural ? await this.neuralConfig() : null;
      if (
        j.recipeVersion !==
          (library
            ? STUDIO_LIBRARY_RECIPE
            : premium
              ? PREMIUM_3D_RECIPE
              : studio
                ? STUDIO_RECIPE
                : neural
                  ? SEGMENTATION_RECIPE
                  : ENHANCEMENT_RECIPE) ||
        j.promptVersion !== (studio ? sc!.profile.promptVersion : EDIT_PROMPT_VERSION) ||
        (studio &&
          (j.provider !== sc!.provider ||
            j.model !== sc!.model ||
            j.modelRevision !== sc!.revision ||
            sp.styleHash !== sc!.styleHash))
      )
        throw new Error('IMAGE_CONFIG_CHANGED');
      if (
        neural &&
        (!neuralConfig ||
          j.model !== neuralConfig.model ||
          j.modelRevision !== SEGMENTATION_MODELS[neuralConfig.model].sha256)
      )
        throw new Error('SEGMENTATION_UNAVAILABLE_KEEP_ORIGINAL');
      if (j.mode !== 'CLEAN' && !neural && !studio && !s.segmentation)
        throw new Error('IMAGE_MATTING_DISABLED');
      if (
        j.mode === 'AI_ENHANCE' &&
        (!s.ai ||
          j.provider !== s.provider ||
          j.model !== s.model ||
          j.modelRevision !== s.revision ||
          j.provider === 'gemini')
      )
        throw new Error('IMAGE_CONFIG_CHANGED');
      const source = await this.read(j.image.asset!.key);
      if (hash(Buffer.concat([Buffer.from(source.mime), source.bytes])) !== j.sourceHash)
        throw new Error('IMAGE_SOURCE_HASH_CHANGED');
      const input: CodecInput = {
        bytes: source.bytes,
        mime: source.mime,
        mode: j.mode,
        matting: s.segmentation,
        background: j.background,
        ...(studio && sp.referenceKind === 'ORIGINAL_REFERENCE'
          ? { originalReference: true, studioProfile: sc!.profile }
          : studio
            ? {
                mask: (
                  await this.read(
                    (
                      await this.studioSource(
                        j.sessionId,
                        j.imageId,
                        sp.sourceCandidateId,
                        sp.sourceMediaRevision,
                      )
                    ).candidate.maskAsset!.key,
                  )
                ).bytes,
                studioProfile: sc!.profile,
                ...(sc!.profile.placementRecipe
                  ? {
                      placement: validateTabletopPlacement(
                        (j.parameters as { placementRequest?: unknown }).placementRequest,
                      ),
                    }
                  : {}),
              }
            : {}),
      };
      if (studio) await this.studioJobSource(j);
      if (
        studio &&
        sp.referenceKind !== 'ORIGINAL_REFERENCE' &&
        hash(input.mask!) !== (j.parameters as { maskHash: string }).maskHash
      )
        throw new Error('STUDIO_MASK_HASH_CHANGED');
      const region = (j.parameters as { foregroundRegion?: ForegroundRegion })?.foregroundRegion;
      let result: CodecOutput = neural
        ? await isolatedSegmentation({ ...input, region }, neuralConfig!)
        : await isolatedEnhancement(input);
      if (j.mode === 'AI_ENHANCE' || studio) {
        if (
          !(await this.authorized(id)) ||
          !(await this.db.productImageEnhancementJob.count({
            where: { id, status: 'PROCESSING', leaseToken: lease },
          }))
        )
          throw new Error('IMAGE_CANCELLED');
        usageId = (await this.budget.reserveImage(j)).id;
        // Recheck source/actor/cancellation after reservation and immediately before transport.
        if (studio) await this.studioJobSource(j);
        if (
          !(await this.authorized(id)) ||
          !(await this.db.productImageEnhancementJob.count({
            where: { id, status: 'PROCESSING', leaseToken: lease },
          }))
        )
          throw new Error('IMAGE_CANCELLED');
        dispatched = true;
        const output = library
          ? await this.provider.productStudio(
              result.providerInput!,
              j.sourceHash,
              (j.parameters as { maskHash: string }).maskHash,
              librarySelection!,
              result.details?.placement as TabletopGeometry | undefined,
              sp.referenceKind,
            )
          : studio
            ? await this.provider.studio(
                result.providerInput!,
                j.sourceHash,
                selectedPreset,
                result.details?.placement as TabletopGeometry | undefined,
              )
            : await this.provider.edit(result.providerInput!, j.sourceHash);
        if (studio)
          studioUsage = (output as import('./gemini-studio.provider').StudioEditResult).usage;
        if (studio)
          studioBilling = (output as import('./gemini-studio.provider').StudioEditResult).billing;
        if (studio)
          studioRequestMetadata = (output as import('./gemini-studio.provider').StudioEditResult)
            .requestMetadata;
        if (studio)
          studioModelVersion = (output as import('./gemini-studio.provider').StudioEditResult)
            .modelVersion;
        reported = output.reported;
        if (output.requestId)
          await this.db.productImageEnhancementJob.updateMany({
            where: { id, leaseToken: lease },
            data: { providerRequestId: output.requestId },
          });
        result = await isolatedEnhancement({ ...input, generated: output.bytes });
      }
      await inspectImage(result.png, 'image/png');
      const master = neural
        ? await sharp(result.png).webp({ lossless: true }).toBuffer()
        : result.png;
      const mimeType = neural ? 'image/webp' : 'image/png';
      const masterMetadata = await sharp(master, { limitInputPixels: 4096 * 4096 }).metadata();
      const contentHash = hash(master),
        key = `products/intake-${hash('enhancement/' + j.identityKey + '/' + contentHash)}.${neural ? 'webp' : 'png'}`;
      const stored = await storageDeadline(
        this.storage.putObject({
          key,
          body: master,
          mimeType,
          size: master.length,
        }),
      );
      const mask = neural ? (result as SegmentOutput).mask : null;
      const maskKey = mask
        ? `products/intake-${hash('mask/' + j.identityKey + '/' + hash(mask))}.png`
        : null;
      const storedMask =
        mask && maskKey
          ? await storageDeadline(
              this.storage.putObject({
                key: maskKey,
                body: mask,
                mimeType: 'image/png',
                size: mask.length,
              }),
            )
          : null;
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ProductIntakeSession" WHERE id=${j.sessionId} FOR UPDATE`;
        const current = await tx.productIntakeSession.findUniqueOrThrow({
          where: { id: j.sessionId },
        });
        if (
          current.status !== 'DRAFT' ||
          current.selectedImageKey !== j.image.clientImageId ||
          !(await this.authorized(id))
        )
          throw new Error('IMAGE_SOURCE_CHANGED');
        if (studio) await this.studioJobSource(j, tx);
        const fence = await tx.productImageEnhancementJob.updateMany({
          where: { id, status: 'PROCESSING', leaseToken: lease },
          data: {
            status: 'COMPLETED',
            metrics: {
              ...result.metrics,
              masterBytes: master.length,
              maskBytes: mask?.length ?? 0,
              totalMs: Date.now() - start,
            },
            errorCode: null,
            completedAt: new Date(),
          },
        });
        if (!fence.count) return; // A cancelled/expired worker cannot create an approved candidate.
        const asset = await tx.fileAsset.upsert({
          where: { key },
          update: {},
          create: {
            key,
            url: stored.url,
            mimeType,
            size: master.length,
            intakePrivate: true,
            uploadedByAdminId: j.actorId,
          },
        });
        const maskAsset =
          maskKey && storedMask && mask
            ? await tx.fileAsset.upsert({
                where: { key: maskKey },
                update: {},
                create: {
                  key: maskKey,
                  url: storedMask.url,
                  mimeType: 'image/png',
                  size: mask.length,
                  intakePrivate: true,
                  uploadedByAdminId: j.actorId,
                },
              })
            : null;
        await tx.productImageEnhancementCandidate.create({
          data: {
            jobId: id,
            assetId: asset.id,
            contentHash,
            width: masterMetadata.width,
            height: masterMetadata.height,
            qualityStatus: 'REVIEW_REQUIRED',
            mediaRole: isGenerativeImageMode(j.mode) ? 'AI_PROMOTIONAL' : 'FACTUAL',
            warnings: [
              ...result.warnings,
              ...(library && j.provider === 'mock' ? ['MOCK_WORKFLOW_ONLY_NOT_FAL_QUALITY'] : []),
            ],
            ...(studio
              ? {
                  processingDetails: {
                    ...(result.details as Prisma.InputJsonObject),
                    sourceHash: j.sourceHash,
                    ...(j.parameters as object),
                    providerReportedUsage: studioUsage ?? {},
                    providerModelVersion: studioModelVersion ?? null,
                    ...(studioBilling ? { falBilling: studioBilling } : {}),
                    ...(studioRequestMetadata
                      ? { providerRequestMetadata: studioRequestMetadata }
                      : {}),
                    mockOnly: j.provider === 'mock',
                  },
                }
              : {}),
            ...(neural
              ? {
                  maskAssetId: maskAsset!.id,
                  processingDetails: {
                    ...(result as SegmentOutput).details,
                    sourceHash: j.sourceHash,
                    maskHash: hash(mask!),
                  },
                }
              : {}),
          },
        });
      });
      if (usageId)
        await this.budget.settleImage(usageId, reported, Date.now() - start, {
          resolution: '1024',
          actualBilling: 'NOT_AVAILABLE',
          providerRequestRecorded: !!(
            await this.db.productImageEnhancementJob.findUnique({ where: { id } })
          )?.providerRequestId,
          ...(studioUsage ? { providerUsage: studioUsage } : {}),
          ...(studioBilling ? { falBilling: studioBilling } : {}),
        });
    } catch (error) {
      const raw = error instanceof Error ? error.message : '',
        code = /^[A-Z0-9_]{1,100}$/.test(raw) ? raw : 'IMAGE_PROCESSING_FAILED';
      const providerDiagnostics =
        j.provider === 'fal' && error instanceof ImageProviderError ? error.diagnostics : undefined;
      const ambiguous =
        dispatched && (!reported || (error instanceof ImageProviderError && error.possiblyBilled));
      const deferred =
        !dispatched &&
        j.provider === 'local' &&
        [
          'IMAGE_LOCAL_BUSY',
          'IMAGE_WORKER_FAILED',
          'IMAGE_WORKER_EXITED',
          'IMAGE_STORAGE_TIMEOUT',
          'SEGMENTATION_BUSY',
          'SEGMENTATION_WORKER_FAILED',
        ].includes(code) &&
        j.attempts < 3;
      await this.db.productImageEnhancementJob.updateMany({
        where: { id, status: 'PROCESSING', leaseToken: lease },
        data: {
          status: deferred ? 'PENDING' : ambiguous ? 'UNKNOWN' : 'FAILED',
          errorCode: code,
          nextDispatchAt: new Date(Date.now() + 10000),
          completedAt: deferred ? null : new Date(),
          ...(providerDiagnostics?.requestId
            ? { providerRequestId: providerDiagnostics.requestId }
            : {}),
        },
      });
      if (usageId) {
        if (!dispatched) await this.budget.releaseBeforeDispatch(usageId, code);
        else
          await this.budget.settleImage(
            usageId,
            reported,
            Date.now() - start,
            {
              actualBilling: 'NOT_AVAILABLE',
              ...(studioUsage ? { providerUsage: studioUsage } : {}),
              ...(studioBilling ? { falBilling: studioBilling } : {}),
              ...(providerDiagnostics ? { providerDiagnostics } : {}),
            },
            code,
          );
      }
    }
  }
}
