import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mergeMap, tap } from 'rxjs';
import { Request } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';
import { IMAGE_RECIPE, SOURCE_KEY } from 'src/image-optimization/image-recipe';
import { SocketsService } from 'src/sockets/sockets.service';

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

@Injectable()
export class CatalogMediaInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sockets: SocketsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler<unknown>) {
    const req = context.switchToHttp().getRequest<Request>();
    const mutation = /^\/api\/admin\/(products|auctions|categories)(?:\/([^/]+))?/.exec(req.path);
    if (req.method !== 'GET' && mutation) {
      return next.handle().pipe(
        tap(() => {
          this.sockets.emitToCustomers('catalog_changed', {
            family: mutation[1],
            id: mutation[2] ?? null,
          });
        }),
      );
    }
    const inventoryRead = /^\/api\/admin\/products\/[^/]+\/inventory\/?$/.test(req.path);
    if (
      req.method !== 'GET' ||
      req.headers['x-catalog-media'] !== '1' ||
      (!inventoryRead &&
        !/\/(?:catalog\/)?(?:products|auctions|marketplace)(?:\/[^/]+)?\/?$/.test(req.path)) ||
      req.path.includes('/wins/')
    )
      return next.handle();
    return next.handle().pipe(
      mergeMap(async (body) => {
        const envelope = object(body);
        const data = object(envelope?.success === true ? envelope.data : body);
        const rawItems: unknown[] =
          inventoryRead && data?.product
            ? [data.product]
            : Array.isArray(data?.items)
              ? data.items
              : data?.id
                ? [data]
                : [];
        const items = rawItems
          .map(object)
          .filter((item): item is Record<string, unknown> => item !== undefined);
        const keys = new Set<string>();
        for (const item of items) {
          const endsAt =
            item.endsAt instanceof Date
              ? item.endsAt
              : typeof item.endsAt === 'string'
                ? new Date(item.endsAt)
                : undefined;
          const active =
            item.status === 'ACTIVE' &&
            (endsAt ? endsAt > new Date() : Number(item.availableQuantity) > 0);
          if (!active && !req.path.startsWith('/api/admin/inventory/') && !inventoryRead) continue;
          for (const url of (Array.isArray(item.imageUrls) ? item.imageUrls : []).slice(0, 12)) {
            const key = this.key(url);
            if (key) keys.add(key);
          }
        }
        if (!keys.size) return body;
        const isList = Array.isArray(data?.items);
        const assets = await this.prisma.fileAsset.findMany({
          where: { key: { in: [...keys].slice(0, 120) }, uploadedByCustomerId: null },
          select: {
            key: true,
            variants: {
              where: {
                recipeVersion: IMAGE_RECIPE,
                ...(isList
                  ? { variantType: { in: ['THUMBNAIL', 'CATALOG'] as ('THUMBNAIL' | 'CATALOG')[] } }
                  : {}),
              },
              select: {
                variantType: true,
                format: true,
                storageKey: true,
                width: true,
                height: true,
              },
            },
          },
        });
        const media = assets
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
          }));
        return media.length ? { ...envelope, imageMedia: media } : body;
      }),
    );
  }

  private key(value: unknown) {
    if (typeof value !== 'string') return undefined;
    try {
      const origin = this.config.get<string>('app.publicBaseUrl') ?? 'http://localhost:8080';
      const url = new URL(value, origin);
      if (url.origin !== new URL(origin).origin) return undefined;
      const key = url.pathname.replace(/^\/api\/media\//, '');
      return SOURCE_KEY.test(key) ? key : undefined;
    } catch {
      return undefined;
    }
  }
}
