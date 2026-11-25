import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageJobStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { STORAGE_PROVIDER, StorageProvider } from 'src/files/storage-provider.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { encodeVariants, ImageInputError } from './image-codec';
import {
  DEFAULT_IMAGE_PIXELS,
  IMAGE_ATTEMPTS,
  IMAGE_RECIPE,
  MAX_IMAGE_BYTES,
  SOURCE_KEY,
  VARIANT_FOLDER,
} from './image-recipe';

const digest = (content: Buffer) => createHash('sha256').update(content).digest('hex');

@Injectable()
export class ImageOptimizationService {
  private readonly logger = new Logger(ImageOptimizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async process(jobId: string): Promise<void> {
    const job = await this.prisma.fileAssetImageJob.findUnique({
      where: { id: jobId },
      include: { asset: true },
    });
    if (
      !job ||
      job.recipeVersion !== IMAGE_RECIPE ||
      job.status === 'COMPLETED' ||
      job.status === 'FAILED'
    )
      return;

    const fence = { id: jobId, attempts: job.attempts, status: job.status };
    if (job.attempts >= IMAGE_ATTEMPTS) {
      await this.prisma.fileAssetImageJob.updateMany({
        where: fence,
        data: { status: 'FAILED', errorCode: 'IMAGE_ATTEMPTS_EXHAUSTED' },
      });
      return;
    }

    const claim = await this.prisma.fileAssetImageJob.updateMany({
      where: fence,
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });
    if (!claim.count) return;
    const attempt = { id: jobId, status: ImageJobStatus.PROCESSING, attempts: job.attempts + 1 };

    try {
      if (job.asset.uploadedByCustomerId || !SOURCE_KEY.test(job.asset.key))
        throw new ImageInputError('UNSUPPORTED_IMAGE_TYPE');
      const source = await this.readSource(job.asset.key);
      const sourceHash = digest(source);
      const assetSlug = digest(Buffer.from(job.assetId)).slice(0, 32);
      const variants: Prisma.FileAssetVariantCreateManyInput[] = [];
      for await (const variant of encodeVariants(
        source,
        job.asset.mimeType,
        this.config.get<number>('imageOptimization.maxPixels') ?? DEFAULT_IMAGE_PIXELS,
      )) {
        const hash = digest(variant.body);
        const file = `${assetSlug}-${IMAGE_RECIPE}-${hash}-${variant.variantType.toLowerCase()}.${variant.extension}`;
        const storageKey = `${VARIANT_FOLDER}/${file}`;
        await this.storage.putObject({
          key: storageKey,
          body: variant.body,
          mimeType: variant.format === 'WEBP' ? 'image/webp' : 'image/jpeg',
          size: variant.body.length,
        });
        variants.push({
          assetId: job.assetId,
          recipeVersion: IMAGE_RECIPE,
          variantType: variant.variantType,
          format: variant.format,
          storageKey,
          width: variant.width,
          height: variant.height,
          fileSize: variant.body.length,
          contentHash: hash,
        });
      }
      await this.prisma.$transaction(async (tx) => {
        const committed = await tx.fileAssetImageJob.updateMany({
          where: attempt,
          data: { status: 'COMPLETED', sourceHash, errorCode: null },
        });
        if (committed.count) {
          await tx.fileAssetVariant.createMany({ data: variants, skipDuplicates: true });
        }
      });
    } catch (error) {
      const permanent = error instanceof ImageInputError;
      const terminal = permanent || attempt.attempts >= IMAGE_ATTEMPTS;
      const code = permanent ? error.code : 'IMAGE_PROCESSING_ERROR';
      await this.prisma.fileAssetImageJob.updateMany({
        where: attempt,
        data: { status: terminal ? 'FAILED' : 'PENDING', errorCode: code },
      });
      this.logger.warn(`Image job ${jobId}, attempt ${attempt.attempts}: ${code}`);
      if (!terminal) throw new Error(code);
    }
  }

  private async readSource(key: string) {
    const object = await this.storage.getObject(key);
    if (object.size > MAX_IMAGE_BYTES) {
      object.stream.destroy();
      throw new ImageInputError('IMAGE_TOO_LARGE');
    }
    const parts: Buffer[] = [];
    let bytes = 0;
    const timer = setTimeout(
      () => object.stream.destroy(new Error('IMAGE_SOURCE_TIMEOUT')),
      20_000,
    );
    try {
      for await (const chunk of object.stream) {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += part.length;
        if (bytes > MAX_IMAGE_BYTES) throw new ImageInputError('IMAGE_TOO_LARGE');
        parts.push(part);
      }
      if (bytes !== object.size) throw new Error('IMAGE_SOURCE_INCOMPLETE');
      return Buffer.concat(parts, bytes);
    } finally {
      clearTimeout(timer);
      object.stream.destroy();
    }
  }
}
