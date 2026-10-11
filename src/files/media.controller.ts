import { Controller, Get, HttpStatus, Inject, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { AppException } from 'src/common/exceptions/app.exception';
import { UPLOAD_IMAGE_FOLDERS } from 'src/uploads/dto/upload-image.dto';
import { STORAGE_PROVIDER, StorageProvider } from 'src/files/storage-provider.interface';

@ApiExcludeController()
@Controller('media')
export class MediaController {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  @Get(':folder/:filename')
  async getMedia(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() response: Response,
  ) {
    if (
      !UPLOAD_IMAGE_FOLDERS.includes(folder as (typeof UPLOAD_IMAGE_FOLDERS)[number]) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(filename)
    ) {
      throw new AppException('Media was not found', 'MEDIA_NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const object = await this.storage.getObject(`${folder}/${filename}`);
    response.status(HttpStatus.OK);
    response.setHeader('Content-Type', object.mimeType);
    response.setHeader('Content-Length', object.size.toString());
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    object.stream.pipe(response);
  }
}
