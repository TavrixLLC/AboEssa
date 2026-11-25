import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { IMAGE_RECIPE, SOURCE_KEY } from 'src/image-optimization/image-recipe';

@Injectable()
export class CatalogMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async lookup(input: string) {
    const keys = [...new Set(input.split(','))].filter((key) => SOURCE_KEY.test(key)).slice(0, 40);
    if (!keys.length) return { imageMedia: [] };
    const base = this.config.get<string>('app.publicBaseUrl')?.replace(/\/+$/, '') ?? '';
    const authorized = await this.prisma.$queryRaw<{ key: string }[]>(Prisma.sql`
      SELECT a."key" FROM "FileAsset" a
      WHERE a."key" IN (${Prisma.join(keys)}) AND a."uploadedByCustomerId" IS NULL
      AND (NOT a."intakePrivate" OR EXISTS(SELECT 1 FROM "ProductListing" ip WHERE ip.id=a."intakeProductId" AND ip.status='ACTIVE' AND ip."availableQuantity">0)) AND (
        EXISTS (SELECT 1 FROM "ProductListing" p WHERE p."status" = 'ACTIVE'
          AND p."availableQuantity" > 0 AND p."imageUrls" && ARRAY[
            '/api/media/' || a."key", ${base} || '/api/media/' || a."key"]::text[])
        OR EXISTS (SELECT 1 FROM "Auction" p WHERE p."status" = 'ACTIVE'
          AND p."endsAt" > NOW() AND p."imageUrls" && ARRAY[
            '/api/media/' || a."key", ${base} || '/api/media/' || a."key"]::text[])
      )
    `);
    const assets = await this.prisma.fileAsset.findMany({
      where: { key: { in: authorized.map((a) => a.key) } },
      select: { key: true, variants: { where: { recipeVersion: IMAGE_RECIPE } } },
    });
    return {
      imageMedia: assets
        .filter((a) => a.variants.length)
        .map((asset) => ({
          originalUrl: `/api/media/${asset.key}`,
          variants: asset.variants.map((v) => ({
            type: v.variantType.toLowerCase(),
            format: v.format.toLowerCase(),
            url: `/api/media/catalog-variants/v/${v.storageKey.split('/')[1]}`,
            width: v.width,
            height: v.height,
          })),
        })),
    };
  }
}
