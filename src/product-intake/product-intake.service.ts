import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProductIntakeSession } from '@prisma/client';
import { createHash } from 'node:crypto';
import { DuplicateDetectionService } from 'src/ai/duplicate-detection.service';
import { selectedIntakeAsset } from 'src/image-enhancement/enhancement-selection';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthenticatedUser } from 'src/common/types/authenticated-user.interface';
import { InventoryService } from 'src/inventory/inventory.service';
import {
  InventoryLedger as L,
  InventoryTx,
  inventoryError as fail,
} from 'src/inventory/inventory-ledger';
import { ProductsService } from 'src/products/products.service';
import { UploadsService, UploadedImageFile } from 'src/uploads/uploads.service';
import { STORAGE_PROVIDER, StorageProvider } from 'src/files/storage-provider.interface';
import { encodeVariants } from 'src/image-optimization/image-codec';
import { IMAGE_RECIPE, MAX_IMAGE_BYTES } from 'src/image-optimization/image-recipe';
import {
  IntakeCreateDto,
  IntakeImageDto,
  IntakeListDto,
  IntakeMetadataDto,
  IntakePatchDto,
  IntakeRevisionDto,
} from './product-intake.dto';

const metadata = (row: ProductIntakeSession) =>
  row.approvedMetadata as unknown as IntakeMetadataDto;
const permitted = (actor: AuthenticatedUser, key: string) =>
  actor.isOwner || actor.role === 'OWNER' || actor.permissions?.includes(key);
@Injectable()
export class ProductIntakeService {
  private readonly logger = new Logger(ProductIntakeService.name);
  private previews = 0;
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly inventory: InventoryService,
    private readonly products: ProductsService,
    private readonly uploads: UploadsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly duplicates: DuplicateDetectionService,
  ) {}
  assertEnabled() {
    if (this.config.get<boolean>('intake.enabled') !== true)
      fail('INTAKE_DISABLED', 'Rapid intake is disabled', 404);
    this.inventory.assertEnabled();
  }
  private all(actor: AuthenticatedUser) {
    return permitted(actor, 'product_intake.manage_all');
  }
  private async owned(
    id: string,
    actor: AuthenticatedUser,
    client: InventoryTx | PrismaService = this.db,
  ) {
    const row = await client.productIntakeSession.findUnique({ where: { id } });
    if (!row || (!this.all(actor) && row.createdById !== actor.id))
      fail('INTAKE_NOT_FOUND', 'Intake session was not found', 404);
    return row!;
  }
  private editable(row: ProductIntakeSession, revision?: number) {
    if (row.status !== 'DRAFT')
      fail('INTAKE_NOT_EDITABLE', 'This session is already completed or cancelled');
    if (revision !== undefined && row.revision !== revision)
      fail(
        'INTAKE_REVISION_CONFLICT',
        'Draft changed on another device; reload without discarding local edits',
      );
  }
  private async current(row: ProductIntakeSession, client: InventoryTx | PrismaService = this.db) {
    return row.selectedImageKey
      ? client.productIntakeImage.findUnique({
          where: {
            sessionId_clientImageId: { sessionId: row.id, clientImageId: row.selectedImageKey },
          },
          include: {
            asset: {
              include: {
                imageJobs: { where: { recipeVersion: IMAGE_RECIPE } },
                variants: { where: { recipeVersion: IMAGE_RECIPE } },
              },
            },
          },
        })
      : null;
  }
  private missing(row: ProductIntakeSession, imageReady: boolean) {
    const m = metadata(row),
      fields: string[] = [];
    if (!imageReady) fields.push('image');
    if (!row.quantity) fields.push('quantity');
    if (!row.locationId) fields.push('locationId');
    if (row.mode === 'STOCK_IN') {
      if (!row.existingProductId) fields.push('existingProductId');
    } else {
      if (!m.title?.trim()) fields.push('title');
      if (!m.categoryId) fields.push('categoryId');
      if (
        !m.price ||
        !new Prisma.Decimal(m.price).gt(0) ||
        new Prisma.Decimal(m.price).gt('9999999999.99')
      )
        fields.push('price');
    }
    return fields;
  }
  private async view(row: ProductIntakeSession) {
    const image = await this.current(row),
      job = image?.asset?.imageJobs[0];
    return {
      ...row,
      missingFields: this.missing(row, image?.status === 'READY' && !!image.assetId),
      image: image
        ? {
            clientImageId: image.clientImageId,
            uploadStatus: image.status,
            mediaStatus: job?.status ?? (image.assetId ? 'NOT_SCHEDULED' : 'NO_IMAGE'),
            assetId: image.assetId,
            lastErrorCode: image.lastErrorCode ?? job?.errorCode,
            hasVariants: !!image.asset?.variants.length,
          }
        : null,
    };
  }
  async create(dto: IntakeCreateDto, actor: AuthenticatedUser) {
    const row = await this.inventory.transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${actor.id + '/' + dto.clientDraftId},0))) q`;
      const old = await tx.productIntakeSession.findUnique({
        where: {
          createdById_clientDraftId: { createdById: actor.id, clientDraftId: dto.clientDraftId },
        },
      });
      if (old) {
        if (old.submissionOperationKey !== dto.submissionOperationKey) fail('IDEMPOTENCY_CONFLICT');
        return old;
      }
      return tx.productIntakeSession.create({
        data: {
          createdById: actor.id,
          clientDraftId: dto.clientDraftId,
          submissionOperationKey: dto.submissionOperationKey,
        },
      });
    });
    return this.view(row);
  }
  async list(q: IntakeListDto, actor: AuthenticatedUser) {
    const rows = await this.db.productIntakeSession.findMany({
      where: {
        ...(q.allEmployees === 'true' && this.all(actor) ? {} : { createdById: actor.id }),
        status: q.status,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      skip: (q.page - 1) * q.limit,
    });
    return {
      items: await Promise.all(rows.slice(0, q.limit).map((r) => this.view(r))),
      meta: { page: q.page, limit: q.limit, hasMore: rows.length > q.limit },
    };
  }
  async one(id: string, actor: AuthenticatedUser) {
    return this.view(await this.owned(id, actor));
  }
  async patch(id: string, dto: IntakePatchDto, actor: AuthenticatedUser) {
    const row = await this.inventory.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProductIntakeSession" WHERE id=${id} FOR UPDATE`;
      const s = await this.owned(id, actor, tx);
      this.editable(s, dto.expectedRevision);
      if (dto.approvedMetadata?.categoryId) {
        const c = await tx.category.findUnique({ where: { id: dto.approvedMetadata.categoryId } });
        if (!c?.isActive) fail('CATEGORY_INACTIVE', 'Choose an existing active category', 400);
      }
      if (dto.locationId) {
        const l = await tx.warehouseLocation.findUnique({
          where: { id: dto.locationId },
          include: { warehouse: true },
        });
        if (!l?.isActive || !l.warehouse.isActive || l.isSystem)
          fail('PHYSICAL_LOCATION_REQUIRED', 'Choose an active physical warehouse location', 400);
      }
      if (
        dto.existingProductId &&
        !(await tx.productListing.findUnique({
          where: { id: dto.existingProductId },
          select: { id: true },
        }))
      )
        fail('PRODUCT_NOT_FOUND', 'Product not found', 404);
      return tx.productIntakeSession.update({
        where: { id },
        data: {
          mode: dto.mode,
          approvedMetadata: dto.approvedMetadata
            ? (JSON.parse(
                JSON.stringify({
                  ...metadata(s),
                  // Transformed DTO class fields can exist with undefined values.
                  // A partial edit must not erase untouched employee/approved fields.
                  ...JSON.parse(JSON.stringify(dto.approvedMetadata)),
                }),
              ) as Prisma.InputJsonValue)
            : undefined,
          quantity: dto.quantity,
          locationId: dto.locationId,
          existingProductId: dto.existingProductId,
          selectedImageKey: dto.selectedImageKey,
          revision: { increment: 1 },
        },
      });
    });
    return this.view(row);
  }
  async upload(
    id: string,
    dto: IntakeImageDto,
    file: UploadedImageFile | undefined,
    actor: AuthenticatedUser,
  ) {
    const session = await this.owned(id, actor);
    this.editable(session);
    if (!file?.buffer || file.buffer.length > MAX_IMAGE_BYTES)
      fail('INVALID_IMAGE', 'Image file missing or too large', 400);
    const hash = createHash('sha256').update(file!.mimetype).update(file!.buffer).digest('hex');
    const extension = (
      { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>
    )[file!.mimetype];
    if (!extension) fail('UNSUPPORTED_IMAGE_TYPE', 'Unsupported image type', 415);
    const storageKey = `products/intake-${createHash('sha256')
      .update(id + '/' + dto.clientImageId + '/' + hash)
      .digest('hex')}.${extension}`;
    let image = await this.inventory.transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${id + '/' + dto.clientImageId},0))) q`;
      const s = await this.owned(id, actor, tx);
      this.editable(s);
      const old = await tx.productIntakeImage.findUnique({
        where: { sessionId_clientImageId: { sessionId: id, clientImageId: dto.clientImageId } },
      });
      if (old) {
        if (old.requestHash !== hash)
          fail('IDEMPOTENCY_CONFLICT', 'Image ID was already used for different bytes');
        return old;
      }
      return tx.productIntakeImage.create({
        data: { sessionId: id, clientImageId: dto.clientImageId, requestHash: hash, storageKey },
      });
    });
    if (image.status === 'READY') return this.one(id, actor);
    try {
      // Original + Phase 2 durable image job; no stock transaction is held here.
      await this.uploads.uploadImage(
        file,
        { folder: 'products' },
        image.sessionId === session.id ? session.createdById : actor.id,
        { key: storageKey },
      );
      const asset = await this.db.fileAsset.findUniqueOrThrow({ where: { key: storageKey } });
      image = await this.db.productIntakeImage.update({
        where: { id: image.id },
        data: { assetId: asset.id, status: 'READY', lastErrorCode: null },
      });
    } catch (error) {
      await this.db.productIntakeImage.updateMany({
        where: { id: image.id, status: { not: 'READY' } },
        data: { status: 'FAILED', lastErrorCode: 'IMAGE_UPLOAD_FAILED' },
      });
      throw error;
    }
    // Only selectedImageKey determines preview/submission. An old retake can never
    // attach itself to a new draft or replace a newer image selection.
    return this.one(id, actor);
  }
  async retryMedia(id: string, actor: AuthenticatedUser) {
    if (this.config.get<boolean>('imageOptimization.enabled') !== true)
      fail('IMAGE_PROCESSING_DISABLED');
    const s = await this.owned(id, actor),
      image = await this.current(s);
    if (s.status === 'CANCELLED' || !image?.assetId) fail('IMAGE_NOT_READY');
    await this.db.fileAssetImageJob.upsert({
      where: { assetId_recipeVersion: { assetId: image!.assetId!, recipeVersion: IMAGE_RECIPE } },
      create: { assetId: image!.assetId!, recipeVersion: IMAGE_RECIPE },
      update: {},
    });
    await this.db.fileAssetImageJob.updateMany({
      where: { assetId: image!.assetId!, recipeVersion: IMAGE_RECIPE, status: 'FAILED' },
      data: { status: 'PENDING', attempts: 0, errorCode: null, nextDispatchAt: new Date() },
    });
    return this.one(id, actor);
  }
  async submit(id: string, dto: IntakeRevisionDto, key: string, actor: AuthenticatedUser) {
    const initial = await this.owned(id, actor);
    if (!key?.trim()) fail('IDEMPOTENCY_KEY_REQUIRED', 'Submission key is required', 400);
    if (key !== initial.submissionOperationKey)
      fail('IDEMPOTENCY_CONFLICT', 'Use the persisted session submission key');
    const result = await this.inventory.transaction(async (tx) => {
      const op = await L.operation(
        tx,
        `INTAKE:${id}`,
        key,
        'INTAKE_SUBMIT',
        { sessionId: id, expectedRevision: dto.expectedRevision },
        'ADMIN',
        actor.id,
      );
      if (op.replayed) return op.operation.outcome;
      await tx.$queryRaw`SELECT id FROM "ProductIntakeSession" WHERE id=${id} FOR UPDATE`;
      const s = await this.owned(id, actor, tx);
      this.editable(s, dto.expectedRevision);
      if (!permitted(actor, 'inventory.receive'))
        fail('PERMISSION_DENIED', 'Stock receipt permission required', 403);
      if (
        s.mode === 'NEW' &&
        !permitted(actor, 'products.create') &&
        !permitted(actor, 'products.manage')
      )
        fail('PERMISSION_DENIED', 'Product creation permission required', 403);
      const image = await this.current(s, tx),
        missing = this.missing(s, image?.status === 'READY' && !!image.assetId);
      if (missing.length)
        fail('INTAKE_NOT_READY', `Missing or invalid: ${missing.join(', ')}`, 400);
      let productId = s.existingProductId!;
      if (s.mode === 'NEW') {
        // Fresh advisory check, inside the original atomic/idempotent submission.
        // No model call or alternative inventory write path exists here.
        await this.duplicates.assertNewAllowed(tx, s);
        const m = metadata(s);
        const chosenAsset = await selectedIntakeAsset(tx, s, image!.id, image!.asset!);
        const p = await this.products.createInTransaction(
          tx,
          {
            title: m.title!.trim(),
            description: m.description?.trim(),
            categoryId: m.categoryId!,
            price: Number(m.price),
            discountPercentage: m.discountPercentage,
            imageUrls: [chosenAsset.url],
          },
          actor.id,
          true,
        );
        productId = p.id;
        await tx.fileAsset.update({
          where: { id: chosenAsset.id },
          data: { intakeProductId: p.id },
        });
      }
      const stock = await this.inventory.stockInInTransaction(
        tx,
        productId,
        { quantity: s.quantity!, locationId: s.locationId!, reference: `Intake:${id}` },
        actor.id,
        `${key}:stock`,
        s.mode === 'NEW',
      );
      await tx.productIntakeSession.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date(), completedProductId: productId },
      });
      const outcome = {
        sessionId: id,
        operationId: op.operation.id,
        productId,
        mode: s.mode,
        inventory: stock,
      };
      await L.finish(tx, op.operation.id, outcome);
      await tx.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId: actor.id,
          action: 'product_intake.completed',
          entityType: 'ProductIntakeSession',
          entityId: id,
          metadata: { mode: s.mode, productId, operationId: op.operation.id },
        },
      });
      return outcome;
    });
    const productId = (result as { productId?: string }).productId;
    if (productId) this.inventory.changed(productId, 'intake', actor.id);
    this.logger.log(
      JSON.stringify({
        event: 'product_intake.submission_acknowledged',
        sessionId: id,
        actorId: actor.id,
      }),
    );
    return result;
  }
  async submission(key: string, actor: AuthenticatedUser) {
    const s = await this.db.productIntakeSession.findUnique({
      where: { submissionOperationKey: key },
    });
    if (!s) fail('INTAKE_NOT_FOUND', 'Submission not found', 404);
    await this.owned(s!.id, actor);
    const operation = await this.db.inventoryOperation.findUnique({
      where: { scope_key: { scope: `INTAKE:${s!.id}`, key } },
    });
    return {
      sessionId: s!.id,
      state: operation ? 'COMPLETED' : s!.status === 'CANCELLED' ? 'CANCELLED' : 'NOT_COMMITTED',
      result: operation?.outcome ?? null,
    };
  }
  async cancel(id: string, dto: IntakeRevisionDto, actor: AuthenticatedUser) {
    const row = await this.inventory.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProductIntakeSession" WHERE id=${id} FOR UPDATE`;
      const s = await this.owned(id, actor, tx);
      if (s.status === 'CANCELLED') return s;
      this.editable(s, dto.expectedRevision);
      return tx.productIntakeSession.update({
        where: { id },
        data: { status: 'CANCELLED', revision: { increment: 1 } },
      });
    });
    return this.view(row); // Deliberately retains originals/references; no unsafe GC.
  }
  async preview(id: string, actor: AuthenticatedUser) {
    const s = await this.owned(id, actor),
      image = await this.current(s);
    if (!image?.assetId || !image.asset)
      fail('IMAGE_NOT_READY', 'Original image is not uploaded', 404);
    if (this.previews >= 2) fail('IMAGE_VALIDATOR_BUSY', 'Preview busy; retry', 503);
    this.previews++;
    try {
      // The same bounded 480px catalog image is suitable for the editor and
      // downsampled pending tiles; a 240px thumbnail was visibly soft on tablet.
      const thumb = image!.asset!.variants.find(
        (v) => v.variantType === 'CATALOG' && v.format === 'WEBP',
      );
      const object = await this.storage.getObject(thumb?.storageKey ?? image!.asset!.key);
      if (object.size > MAX_IMAGE_BYTES) {
        object.stream.destroy();
        fail('IMAGE_TOO_LARGE');
      }
      const buffers: Buffer[] = [];
      let length = 0;
      const timer = setTimeout(
        () => object.stream.destroy(new Error('IMAGE_SOURCE_TIMEOUT')),
        15000,
      );
      try {
        for await (const chunk of object.stream as AsyncIterable<unknown>) {
          if (!(chunk instanceof Uint8Array)) fail('IMAGE_SOURCE_INVALID');
          const b = Buffer.from(chunk as Uint8Array);
          length += b.length;
          if (length > MAX_IMAGE_BYTES) fail('IMAGE_TOO_LARGE');
          buffers.push(b);
        }
      } finally {
        clearTimeout(timer);
        object.stream.destroy();
      }
      if (length !== object.size) fail('IMAGE_SOURCE_INCOMPLETE');
      let bytes = Buffer.concat(buffers, length);
      if (!thumb) {
        for await (const v of encodeVariants(bytes, image!.asset!.mimeType)) {
          if (v.variantType === 'CATALOG' && v.format === 'WEBP') {
            bytes = v.body;
            break;
          }
        }
      }
      return {
        clientImageId: image!.clientImageId,
        assetId: image!.assetId,
        mimeType: 'image/webp',
        dataBase64: bytes.toString('base64'),
      };
    } finally {
      this.previews--;
    }
  }
}
