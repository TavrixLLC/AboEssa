import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from 'src/common/exceptions/app.exception';
import { PermissionResolverService } from 'src/permissions/permission-resolver.service';
import { Prisma, ProductRecognitionTask } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { inventoryError as fail, InventoryTx } from 'src/inventory/inventory-ledger';
import { STORAGE_PROVIDER, StorageProvider } from 'src/files/storage-provider.interface';
import { aiSettings, assertGeminiApproved } from './ai.config';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { RecognitionBudgetService } from './recognition-budget.service';
import {
  GeminiRecognitionProvider,
  MockRecognitionProvider,
  ProviderOutput,
  RecognitionProviderError,
} from './recognition.provider';
import {
  CategorySnapshot,
  PROMPT_VERSION,
  recognitionKey,
  SCHEMA_VERSION,
  taxonomyHash,
  validateRecognition,
} from './recognition.schema';
import { recognitionImage } from './recognition-image';

const all = (a: AuthenticatedUser) =>
  a.isOwner || a.role === 'OWNER' || a.permissions?.includes('product_intake.manage_all');
@Injectable()
export class RecognitionService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly duplicates: DuplicateDetectionService,
    private readonly budget: RecognitionBudgetService,
    private readonly mock: MockRecognitionProvider,
    private readonly gemini: GeminiRecognitionProvider,
    private readonly permissions: PermissionResolverService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}
  assertEnabled() {
    if (!aiSettings(this.config).enabled)
      fail('AI_DISABLED', 'الإدخال اليدوي متاح؛ التعرّف غير مفعّل', 404);
  }
  private async owned(
    id: string,
    actor: AuthenticatedUser,
    tx: PrismaService | InventoryTx = this.db,
  ) {
    const row = await tx.productIntakeSession.findUnique({ where: { id } });
    if (!row || (!all(actor) && row.createdById !== actor.id))
      fail('INTAKE_NOT_FOUND', 'Intake session not found', 404);
    return row!;
  }
  private async taxonomy(tx: PrismaService | InventoryTx = this.db): Promise<CategorySnapshot> {
    const categories = await tx.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
      take: 201,
    });
    if (
      !categories.length ||
      categories.length > 200 ||
      categories.some((c) => c.id.length > 80 || c.name.length > 200)
    )
      fail('AI_TAXONOMY_REVIEW_REQUIRED', 'استخدم الاختيار اليدوي للفئة', 409);
    return categories;
  }
  private cacheMatches(
    task: ProductRecognitionTask,
    imageId: string,
    generation: number,
    categories: CategorySnapshot,
  ) {
    const s = aiSettings(this.config);
    return (
      task.cacheKey ===
      recognitionKey(
        task.sourceHash,
        s.provider,
        s.model,
        taxonomyHash(categories),
        `${s.modelRevision}:${generation ? `${imageId}:${generation}` : 'cached'}`,
      )
    );
  }
  async analyze(
    id: string,
    body: { clientImageId: string; requestKey: string; reanalyze?: boolean },
    actor: AuthenticatedUser,
  ) {
    this.assertEnabled();
    const settings = aiSettings(this.config);
    if (settings.provider === 'gemini') {
      try {
        assertGeminiApproved(this.config);
      } catch {
        fail('AI_LIVE_NOT_APPROVED', 'التعرّف الحقيقي غير معتمد؛ أكمل الإدخال اليدوي', 503);
      }
    }
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProductIntakeSession" WHERE id=${id} FOR UPDATE`;
      const s = await this.owned(id, actor, tx);
      if (s.status !== 'DRAFT' || s.selectedImageKey !== body.clientImageId)
        fail('AI_IMAGE_SUPERSEDED');
      const foundImage = await tx.productIntakeImage.findUnique({
        where: { sessionId_clientImageId: { sessionId: id, clientImageId: body.clientImageId } },
        include: { asset: true },
      });
      if (foundImage?.status !== 'READY' || !foundImage.asset?.intakePrivate)
        fail('AI_IMAGE_NOT_READY');
      const image = foundImage!;
      const old = await tx.productRecognitionRequest.findUnique({
        where: { sessionId_requestKey: { sessionId: id, requestKey: body.requestKey } },
      });
      if (old) {
        if (old.imageId !== image.id) fail('IDEMPOTENCY_CONFLICT');
        return;
      }
      // Short admission lock makes cross-session pending caps and cache-hit
      // accounting atomic. Never held across storage, Redis or model calls.
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(660062)) q`;
      const categories = await this.taxonomy(tx),
        hash = taxonomyHash(categories);
      const requests = await tx.productRecognitionRequest.findMany({
        where: { sessionId: id },
        include: { task: true },
        orderBy: { sequence: 'desc' },
        take: 21,
      });
      if (requests.length >= 20) fail('AI_REANALYSIS_LIMIT');
      const previous = requests.filter((r) => r.imageId === image.id);
      const generation = body.reanalyze ? Math.max(0, ...previous.map((r) => r.generation)) + 1 : 0;
      if (generation > 2) fail('AI_REANALYSIS_LIMIT');
      const pending = await tx.productRecognitionRequest.count({
        where: {
          actorId: actor.id,
          status: 'ACTIVE',
          task: { status: { in: ['PENDING', 'PROCESSING'] } },
        },
      });
      if (pending >= 5) fail('AI_PENDING_LIMIT');
      if (
        (await tx.productRecognitionTask.count({
          where: { status: { in: ['PENDING', 'PROCESSING'] } },
        })) >= 100
      )
        fail('AI_PENDING_LIMIT');
      const key = recognitionKey(
        image.requestHash,
        settings.provider,
        settings.model,
        hash,
        `${settings.modelRevision}:${generation ? `${image.id}:${generation}` : 'cached'}`,
      );
      const priorTask = await tx.productRecognitionTask.findUnique({
        where: { cacheKey: key },
        select: { id: true },
      });
      // Cross-session dedup is computation-only; every recipient still owns a separate private link.
      const task = await tx.productRecognitionTask.upsert({
        where: { cacheKey: key },
        update: {},
        create: {
          cacheKey: key,
          sourceImageId: image.id,
          sourceHash: image.requestHash,
          actorId: actor.id,
          provider: settings.provider,
          model: settings.model,
          modelRevision: settings.modelRevision,
          promptVersion: PROMPT_VERSION,
          schemaVersion: SCHEMA_VERSION,
          taxonomyHash: hash,
          categorySnapshot: categories,
        },
      });
      await tx.productRecognitionRequest.updateMany({
        where: { sessionId: id, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED' },
      });
      const request = await tx.productRecognitionRequest.create({
        data: {
          sessionId: id,
          imageId: image.id,
          taskId: task.id,
          actorId: actor.id,
          requestKey: body.requestKey,
          generation,
          sequence: (requests[0]?.sequence ?? 0) + 1,
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId: actor.id,
          action: 'product_intake.recognition_requested',
          entityType: 'ProductIntakeSession',
          entityId: id,
          metadata: {
            requestId: request.id,
            provider: settings.provider,
            model: settings.model,
            cacheHit: task.status === 'COMPLETED',
            computationReused: !!priorTask,
            generation,
          },
        },
      });
    });
    return this.status(id, actor);
  }
  async status(id: string, actor: AuthenticatedUser) {
    this.assertEnabled();
    const s = await this.owned(id, actor);
    const link = await this.db.productRecognitionRequest.findFirst({
      where: { sessionId: id },
      include: { image: true, task: true },
      orderBy: { sequence: 'desc' },
    });
    if (!link) return { state: 'NOT_REQUESTED', clientImageId: s.selectedImageKey };
    let state: string = link.status === 'ACTIVE' ? link.task.status : link.status;
    if (s.status !== 'DRAFT' || link.image.clientImageId !== s.selectedImageKey)
      state = 'SUPERSEDED';
    const currentCategories = state === 'COMPLETED' ? await this.taxonomy() : [];
    if (state === 'COMPLETED' && taxonomyHash(currentCategories) !== link.task.taxonomyHash)
      state = 'STALE_TAXONOMY';
    if (
      state === 'COMPLETED' &&
      !this.cacheMatches(link.task, link.imageId, link.generation, currentCategories)
    )
      state = 'STALE_CONFIG';
    const approved = s.approvedMetadata as { title?: string };
    const suggested = link.task.result as { name_ar?: string; category_id?: string } | null;
    const duplicateCandidates =
      state === 'COMPLETED'
        ? await this.duplicates.candidates(approved.title?.trim() || suggested?.name_ar || '')
        : [];
    return {
      id: link.id,
      requestKey: link.requestKey,
      clientImageId: link.image.clientImageId,
      state,
      provider: link.task.provider,
      model: link.task.model,
      modelRevision: link.task.modelRevision,
      promptVersion: link.task.promptVersion,
      schemaVersion: link.task.schemaVersion,
      taxonomyHash: link.task.taxonomyHash,
      generation: link.generation,
      errorCode: link.task.errorCode,
      completedAt: link.task.completedAt,
      suggestions: state === 'COMPLETED' ? link.task.result : null,
      warnings: link.task.warnings ?? [],
      cacheShared: link.task.sourceImageId !== link.imageId,
      duplicateCandidates,
      categoryName: currentCategories.find((c) => c.id === suggested?.category_id)?.name ?? null,
    };
  }
  async cancel(id: string, requestId: string, actor: AuthenticatedUser) {
    this.assertEnabled();
    await this.owned(id, actor);
    await this.db.productRecognitionRequest.updateMany({
      where: { id: requestId, sessionId: id, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });
    return this.status(id, actor);
  }
  async approve(
    id: string,
    body: {
      requestId: string;
      expectedRevision: number;
      clientImageId: string;
      fields: string[];
      replace?: boolean;
    },
    actor: AuthenticatedUser,
  ) {
    this.assertEnabled();
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProductIntakeSession" WHERE id=${id} FOR UPDATE`;
      const s = await this.owned(id, actor, tx);
      if (s.status !== 'DRAFT' || s.mode !== 'NEW' || s.revision !== body.expectedRevision)
        fail('INTAKE_REVISION_CONFLICT');
      const found = await tx.productRecognitionRequest.findFirst({
        where: { id: body.requestId, sessionId: id, status: 'ACTIVE' },
        include: { image: true, task: true },
      });
      if (
        !found ||
        found.task.status !== 'COMPLETED' ||
        s.selectedImageKey !== body.clientImageId ||
        found.image.clientImageId !== s.selectedImageKey
      )
        fail('AI_IMAGE_SUPERSEDED');
      const r = found!;
      const categories = await this.taxonomy(tx);
      if (taxonomyHash(categories) !== r.task.taxonomyHash) fail('AI_STALE_TAXONOMY');
      if (!this.cacheMatches(r.task, r.imageId, r.generation, categories)) fail('AI_STALE_CONFIG');
      const { result } = validateRecognition(r.task.result, categories),
        metadata = { ...(s.approvedMetadata as Record<string, unknown>) };
      const suggestions: Record<string, unknown> = {
        title: result.name_ar,
        description: result.description_ar,
        categoryId: result.category_id,
      };
      const applied: string[] = [],
        skipped: string[] = [];
      for (const key of body.fields) {
        if (!['title', 'description', 'categoryId'].includes(key))
          fail('AI_FIELD_NOT_APPROVABLE', 'AI cannot set this field', 400);
        if (suggestions[key] === null || (!body.replace && !!metadata[key])) {
          skipped.push(key);
          continue;
        }
        metadata[key] = suggestions[key];
        applied.push(key);
      }
      if (!applied.length)
        return { revision: s.revision, approvedMetadata: metadata, applied, skipped };
      const updated = await tx.productIntakeSession.update({
        where: { id },
        data: {
          approvedMetadata: metadata as Prisma.InputJsonObject,
          recognizedMetadata: {
            requestId: r.id,
            clientImageId: body.clientImageId,
            provider: r.task.provider,
            model: r.task.model,
            modelRevision: r.task.modelRevision,
            promptVersion: r.task.promptVersion,
            schemaVersion: r.task.schemaVersion,
            taxonomyHash: r.task.taxonomyHash,
            suggestions: r.task.result!,
            warnings: r.task.warnings ?? [],
            approvedAt: new Date().toISOString(),
          },
          revision: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId: actor.id,
          action: 'product_intake.ai_approved',
          entityType: 'ProductIntakeSession',
          entityId: id,
          metadata: { requestId: r.id, fields: applied, replace: body.replace ?? false },
        },
      });
      return {
        revision: updated.revision,
        approvedMetadata: updated.approvedMetadata,
        applied,
        skipped,
      };
    });
  }
  async duplicateReview(id: string, actor: AuthenticatedUser) {
    this.assertEnabled();
    return this.duplicates.review(await this.owned(id, actor));
  }
  async decide(
    id: string,
    body: { expectedRevision: number; candidatesHash: string; reason: string },
    actor: AuthenticatedUser,
  ) {
    this.assertEnabled();
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProductIntakeSession" WHERE id=${id} FOR UPDATE`;
      const s = await this.owned(id, actor, tx);
      if (s.status !== 'DRAFT' || s.mode !== 'NEW' || s.revision !== body.expectedRevision)
        fail('INTAKE_REVISION_CONFLICT');
      const review = await this.duplicates.review(s, tx);
      if (review.candidatesHash !== body.candidatesHash) fail('AI_DUPLICATES_CHANGED');
      const data = {
        revision: s.revision,
        identityHash: review.identityHash,
        candidatesHash: review.candidatesHash,
        action: 'DISTINCT_PRODUCT',
        actorId: actor.id,
        reason: body.reason,
        createdAt: new Date(),
      };
      await tx.intakeDuplicateDecision.upsert({
        where: { sessionId: id },
        create: { sessionId: id, ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId: actor.id,
          action: 'product_intake.distinct_product',
          entityType: 'ProductIntakeSession',
          entityId: id,
          metadata: { ...data, candidateIds: review.candidates.map((c) => c.id) },
        },
      });
      return { accepted: true, ...review };
    });
  }
  async usage(actor: AuthenticatedUser) {
    this.assertEnabled();
    return this.budget.summary(actor.isOwner || actor.role === 'OWNER' ? undefined : actor.id);
  }

  async process(id: string) {
    const settings = aiSettings(this.config);
    if (
      !settings.enabled ||
      this.config.get<boolean>('intake.enabled') !== true ||
      this.config.get<boolean>('inventory.managementEnabled') !== true
    )
      return;
    // Expired in-flight calls are ambiguous, never automatically reissued to Gemini.
    const expired = await this.db.productRecognitionTask.findMany({
      where: { id, status: 'PROCESSING', nextDispatchAt: { lte: new Date() } },
    });
    for (const old of expired) {
      await this.db.productRecognitionTask.updateMany({
        where: { id: old.id, status: 'PROCESSING', leaseToken: old.leaseToken },
        data: {
          status: 'UNKNOWN',
          errorCode: 'AI_WORKER_OUTCOME_UNKNOWN',
          completedAt: new Date(),
        },
      });
      await this.db.recognitionUsage.updateMany({
        where: { taskId: id, status: 'RESERVED' },
        data: {
          status: 'UNKNOWN',
          errorCode: 'AI_WORKER_OUTCOME_UNKNOWN',
          completedAt: new Date(),
        },
      });
    }
    const lease = randomUUID();
    const claim = await this.db.productRecognitionTask.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'PROCESSING',
        leaseToken: lease,
        attempts: { increment: 1 },
        startedAt: new Date(),
        nextDispatchAt: new Date(Date.now() + 120000),
      },
    });
    if (!claim.count) return;
    const task = await this.db.productRecognitionTask.findUniqueOrThrow({
      where: { id },
      include: {
        sourceImage: { include: { asset: true } },
        requests: { select: { imageId: true, generation: true }, take: 1 },
      },
    });
    let dispatched = false;
    let usageId: string | undefined,
      output: ProviderOutput | null = null;
    const start = Date.now();
    try {
      if (!(await this.hasAuthorizedRecipient(id))) throw new Error('AI_NO_ACTIVE_RECIPIENT');
      if (
        task.provider !== settings.provider ||
        task.model !== settings.model ||
        task.modelRevision !== settings.modelRevision ||
        task.promptVersion !== PROMPT_VERSION ||
        task.schemaVersion !== SCHEMA_VERSION
      )
        throw new Error('AI_CONFIG_CHANGED');
      const categories = await this.taxonomy();
      if (taxonomyHash(categories) !== task.taxonomyHash) throw new Error('AI_STALE_TAXONOMY');
      const context = task.requests[0];
      if (!context || !this.cacheMatches(task, context.imageId, context.generation, categories))
        throw new Error('AI_CONFIG_CHANGED');
      const asset = task.sourceImage.asset;
      if (!asset?.intakePrivate) throw new Error('AI_PRIVATE_SOURCE_REQUIRED');
      const jpeg = await recognitionImage(this.storage, asset.key, asset.mimeType, task.sourceHash);
      usageId = (await this.budget.reserve(task)).id;
      // Recheck after image I/O and reservation: retake, cancel or permission
      // revocation while preparing must not initiate a new external request.
      if (!(await this.hasAuthorizedRecipient(id))) throw new Error('AI_NO_ACTIVE_RECIPIENT');
      dispatched = true;
      output = await (task.provider === 'mock' ? this.mock : this.gemini).recognize({
        jpeg,
        sourceHash: task.sourceHash,
        categories,
      });
      const validated = validateRecognition(output.value, categories);
      await this.db.productRecognitionTask.updateMany({
        where: { id, status: 'PROCESSING', leaseToken: lease },
        data: {
          status: 'COMPLETED',
          result: validated.result as unknown as Prisma.InputJsonObject,
          warnings: [
            ...validated.warnings,
            ...(task.provider === 'mock' ? ['MOCK_NOT_PHOTO_RECOGNITION'] : []),
          ],
          completedAt: new Date(),
        },
      });
    } catch (error) {
      const code =
        error instanceof AppException && /^AI_[A-Z_]+$/.test(error.code)
          ? error.code
          : error instanceof Error && /^AI_[A-Z_]+$/.test(error.message)
            ? error.message
            : 'AI_PROCESSING_FAILED';
      const ambiguous = error instanceof RecognitionProviderError && error.possiblyBilled;
      const deferred = !usageId && code === 'AI_CONCURRENCY_LIMIT' && task.attempts < 3;
      await this.db.productRecognitionTask.updateMany({
        where: { id, status: 'PROCESSING', leaseToken: lease },
        data: {
          status: deferred ? 'PENDING' : ambiguous ? 'UNKNOWN' : 'FAILED',
          errorCode: code,
          completedAt: deferred ? null : new Date(),
          ...(deferred
            ? { nextDispatchAt: new Date(Date.now() + 10000 * 2 ** task.attempts) }
            : {}),
        },
      });
      if (usageId) {
        if (!dispatched) await this.budget.releaseBeforeDispatch(usageId, code);
        else await this.budget.settle(usageId, output, Date.now() - start, code);
      }
      return;
    }
    if (usageId) await this.budget.settle(usageId, output, Date.now() - start);
  }
  private async hasAuthorizedRecipient(taskId: string) {
    const requests = await this.db.productRecognitionRequest.findMany({
      where: { taskId, status: 'ACTIVE' },
      include: { session: true, image: true },
      take: 100,
    });
    for (const r of requests) {
      if (r.session.status !== 'DRAFT' || r.session.selectedImageKey !== r.image.clientImageId)
        continue;
      const admin = await this.db.adminUser.findUnique({
        where: { id: r.actorId },
        select: { id: true, isActive: true, status: true, isOwner: true, role: true },
      });
      if (!admin?.isActive || admin.status !== 'ACTIVE') continue;
      const permissions = await this.permissions.forAdmin(r.actorId);
      if (
        (admin.isOwner || admin.role === 'OWNER' || permissions.includes('product_intake.use')) &&
        (r.session.createdById === r.actorId ||
          admin.isOwner ||
          admin.role === 'OWNER' ||
          permissions.includes('product_intake.manage_all'))
      )
        return true;
    }
    return false;
  }
}
