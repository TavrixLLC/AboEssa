import { randomUUID } from 'crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from 'src/common/exceptions/app.exception';
import { STORAGE_PROVIDER, StorageProvider } from 'src/files/storage-provider.interface';
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
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async uploadImage(
    file: UploadedImageFile | undefined,
    dto: UploadImageDto,
    adminId: string,
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

    const maxBytes = this.config.get<number>('upload.maxBytes') ?? 5_242_880;
    if (file.size > maxBytes || file.buffer.length > maxBytes) {
      throw new AppException(
        'Image exceeds the maximum upload size',
        'IMAGE_TOO_LARGE',
        HttpStatus.PAYLOAD_TOO_LARGE,
        { maxBytes },
      );
    }

    const folder = this.resolveFolder(dto.folder);
    const key = `${folder}/${randomUUID()}.${extension}`;
    const stored = await this.storage.putObject({
      key,
      body: file.buffer,
      mimeType: file.mimetype,
      size: file.size,
    });

    try {
      return await this.prisma.fileAsset.create({
        data: {
          url: stored.url,
          key: stored.key,
          mimeType: stored.mimeType,
          size: stored.size,
          uploadedByAdminId: adminId,
        },
        select: {
          url: true,
          key: true,
          mimeType: true,
          size: true,
        },
      });
    } catch (error) {
      await this.storage.removeObject(key).catch(() => undefined);
      throw error;
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
