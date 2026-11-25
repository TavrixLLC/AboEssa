import { randomUUID } from 'crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from 'src/common/exceptions/app.exception';
import { STORAGE_PROVIDER, StorageProvider } from 'src/files/storage-provider.interface';
import { ImageInputError, inspectImage } from 'src/image-optimization/image-codec';
import {
  DEFAULT_IMAGE_PIXELS,
  IMAGE_RECIPE,
  MAX_IMAGE_BYTES,
  SOURCE_KEY,
} from 'src/image-optimization/image-recipe';
import {
  UPLOAD_IMAGE_FOLDERS,
  UploadImageDto,
  UploadImageFolder,
  UploadImageResultDto,
} from 'src/uploads/dto/upload-image.dto';
import { PrismaService } from 'src/prisma/prisma.service';

export interface UploadedImageFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const EXTENSIONS_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class UploadsService {
  private decodes = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async uploadImage(
    file: UploadedImageFile | undefined,
    dto: UploadImageDto,
    adminId: string,
    intake?: { key: string },
  ): Promise<UploadImageResultDto> {
    if (!file?.buffer) {
      throw new AppException('Image file is required', 'IMAGE_FILE_REQUIRED');
    }

    const allowedMime = this.config.get<string[]>('upload.allowedMime') ?? [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];
    const extension = EXTENSIONS_BY_MIME[file.mimetype];
    if (!allowedMime.includes(file.mimetype) || !extension) {
      throw new AppException(
        'Unsupported image type',
        'UNSUPPORTED_IMAGE_TYPE',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const maxBytes = Math.min(
      this.config.get<number>('upload.maxBytes') ?? 5_242_880,
      MAX_IMAGE_BYTES,
    );
    if (file.size > maxBytes || file.buffer.length > maxBytes) {
      throw new AppException(
        'Image exceeds the maximum upload size',
        'IMAGE_TOO_LARGE',
        HttpStatus.PAYLOAD_TOO_LARGE,
        { maxBytes },
      );
    }

    const folder = this.resolveFolder(dto.folder);
    await this.validateImage(file);
    const key = intake?.key ?? `${folder}/${randomUUID()}.${extension}`;
    if (intake && !new RegExp(`^products/intake-[a-f0-9]{64}\\.${extension}$`).test(key))
      throw new AppException('Invalid private intake key', 'INVALID_INTAKE_KEY');
    const stored = await this.storage.putObject({
      key,
      body: file.buffer,
      mimeType: file.mimetype,
      size: file.buffer.length,
    });

    try {
      return await this.prisma.fileAsset.create({
        data: {
          url: stored.url,
          key: stored.key,
          mimeType: stored.mimeType,
          size: stored.size,
          uploadedByAdminId: adminId,
          ...(intake ? { intakePrivate: true } : {}),
          ...(this.config.get<boolean>('imageOptimization.enabled') === true && SOURCE_KEY.test(key)
            ? { imageJobs: { create: { recipeVersion: IMAGE_RECIPE } } }
            : {}),
        },
        select: {
          url: true,
          key: true,
          mimeType: true,
          size: true,
        },
      });
    } catch (error) {
      if (intake) {
        // Concurrent retries write identical content-addressed bytes. Never remove
        // an object that another request may already have committed/referenced.
        const prior = await this.prisma.fileAsset.findUnique({
          where: { key },
          select: {
            url: true,
            key: true,
            mimeType: true,
            size: true,
            uploadedByAdminId: true,
            intakePrivate: true,
          },
        });
        if (prior?.intakePrivate && prior.uploadedByAdminId === adminId) return prior;
        throw error;
      }
      await this.storage.removeObject(key).catch(() => undefined);
      throw error;
    }
  }

  private async validateImage(file: UploadedImageFile) {
    if (this.decodes >= 2) {
      throw new AppException(
        'Image validator is busy; retry shortly',
        'IMAGE_VALIDATOR_BUSY',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    this.decodes++;
    try {
      await inspectImage(
        file.buffer,
        file.mimetype,
        this.config.get<number>('imageOptimization.maxPixels') ?? DEFAULT_IMAGE_PIXELS,
      );
    } catch (error) {
      if (!(error instanceof ImageInputError)) throw error;
      const status =
        error.code === 'IMAGE_TOO_LARGE'
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : error.code === 'UNSUPPORTED_IMAGE_TYPE'
            ? HttpStatus.UNSUPPORTED_MEDIA_TYPE
            : HttpStatus.UNPROCESSABLE_ENTITY;
      throw new AppException('Image could not be accepted', error.code, status);
    } finally {
      this.decodes--;
    }
  }

  private resolveFolder(folder?: string): UploadImageFolder {
    const selected = folder ?? 'products';
    if (!UPLOAD_IMAGE_FOLDERS.includes(selected as UploadImageFolder)) {
      throw new AppException('Unsupported upload folder', 'INVALID_UPLOAD_FOLDER');
    }
    return selected as UploadImageFolder;
  }
}
