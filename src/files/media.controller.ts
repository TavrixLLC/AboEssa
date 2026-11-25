import { Controller, Get, HttpStatus, Inject, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { publishedIntakeMedia } from './intake-media-visibility';
import { AppException } from 'src/common/exceptions/app.exception';
import { UPLOAD_IMAGE_FOLDERS } from 'src/uploads/dto/upload-image.dto';
import { STORAGE_PROVIDER, StorageProvider } from 'src/files/storage-provider.interface';

@ApiExcludeController()
@Controller('media')
export class MediaController {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get(':folder/:filename')
  async getMedia(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() response: Response,
  ) {
    // Preserve the legacy original URL and bytes, but don't cache draft uploads
    // or mutable legacy references as immutable.
    response.setHeader('Cache-Control', 'no-store');
    if (
      !UPLOAD_IMAGE_FOLDERS.includes(folder as (typeof UPLOAD_IMAGE_FOLDERS)[number]) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(filename)
    ) {
      throw new AppException('Media was not found', 'MEDIA_NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const key = `${folder}/${filename}`;
    if (key.startsWith('products/intake-')) {
      const asset = await this.prisma.fileAsset.findUnique({
        where: { key },
        select: { intakePrivate: true, intakeProductId: true },
      });
      if (
        !asset?.intakePrivate ||
        !(await publishedIntakeMedia(this.prisma, key, asset.intakeProductId, this.config))
      )
        throw new AppException('Media was not found', 'MEDIA_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    const object = await this.storage.getObject(key);
    response.status(HttpStatus.OK);
    response.setHeader('Content-Type', object.mimeType);
    response.setHeader('Content-Length', object.size.toString());
    response.setHeader('X-Content-Type-Options', 'nosniff');
    object.stream.pipe(response);
  }
}
