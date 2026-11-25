import { Controller, Get, HttpStatus, Inject, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { AppException } from 'src/common/exceptions/app.exception';
import { STORAGE_PROVIDER, StorageProvider } from 'src/files/storage-provider.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { IMAGE_RECIPE, SOURCE_KEY, VARIANT_FOLDER, VARIANT_PATH } from './image-recipe';
import { publishedIntakeMedia } from 'src/files/intake-media-visibility';

@ApiExcludeController()
@Controller('media')
export class ImageVariantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  @Get(':folder/:filename/variants')
  async manifest(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const key = `${folder}/${filename}`;
    if (!SOURCE_KEY.test(key)) throw this.notFound();
    const asset = await this.prisma.fileAsset.findUnique({
      where: { key },
      select: {
        key: true,
        uploadedByCustomerId: true,
        variants: { where: { recipeVersion: IMAGE_RECIPE } },
      },
    });
    if (!asset?.variants.length || asset.uploadedByCustomerId || !(await this.isPublic(asset.key)))
      throw this.notFound();
    return {
      originalUrl: this.mediaUrl(asset.key),
      recipeVersion: IMAGE_RECIPE,
      variants: asset.variants.map((variant) => ({
        type: variant.variantType.toLowerCase(),
        format: variant.format.toLowerCase(),
        url: this.mediaUrl(`catalog-variants/v/${variant.storageKey.split('/')[1]}`),
        width: variant.width,
        height: variant.height,
        fileSize: variant.fileSize,
      })),
    };
  }

  @Get('catalog-variants/v/:filename')
  async getVariant(@Param('filename') filename: string, @Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    if (!VARIANT_PATH.test(filename)) throw this.notFound();
    const key = `${VARIANT_FOLDER}/${filename}`;
    const variant = await this.prisma.fileAssetVariant.findUnique({
      where: { storageKey: key },
      include: { asset: { select: { key: true, uploadedByCustomerId: true } } },
    });
    if (!variant || variant.asset.uploadedByCustomerId || !(await this.isPublic(variant.asset.key)))
      throw this.notFound();
    const object = await this.storage.getObject(key);
    const mime = variant.format === 'WEBP' ? 'image/webp' : 'image/jpeg';
    if (object.mimeType !== mime || object.size !== variant.fileSize) {
      object.stream.destroy();
      throw this.notFound();
    }
    response.setHeader('Content-Type', mime);
    response.setHeader('Content-Length', object.size.toString());
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    await pipeline(object.stream, response);
  }

  private async isPublic(key: string) {
    if (!SOURCE_KEY.test(key)) return false;
    if (key.startsWith('products/intake-')) {
      const asset = await this.prisma.fileAsset.findUnique({
        where: { key },
        select: { intakePrivate: true, intakeProductId: true },
      });
      return (
        !!asset?.intakePrivate &&
        publishedIntakeMedia(this.prisma, key, asset.intakeProductId, this.config)
      );
    }
    const path = this.mediaUrl(key);
    const publicBase = this.config.get<string>('app.publicBaseUrl')?.replace(/\/+$/, '');
    const refs = [
      ...new Set([
        path,
        path.slice(1),
        `/api/media/${key}`,
        ...(publicBase ? [`${publicBase}${path}`, `${publicBase}/api/media/${key}`] : []),
      ]),
    ];
    // The existing imageUrls refer to approved catalog media when an item is
    // published. Do not introduce a second, independently editable approval list.
    const imageUrls = { hasSome: refs };
    if (key.startsWith('products/')) {
      return !!(await this.prisma.productListing.findFirst({
        where: { imageUrls, status: 'ACTIVE', availableQuantity: { gt: 0 } },
        select: { id: true },
      }));
    }
    return !!(await this.prisma.auction.findFirst({
      where: { imageUrls, status: 'ACTIVE', endsAt: { gt: new Date() } },
      select: { id: true },
    }));
  }

  private mediaUrl(key: string) {
    const prefix = (this.config.get<string>('app.apiPrefix') ?? 'api').replace(/^\/+|\/+$/g, '');
    return `/${prefix}/media/${key}`;
  }

  private notFound() {
    return new AppException('Media was not found', 'MEDIA_NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}
