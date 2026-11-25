import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { isPromotionalCandidate } from 'src/image-enhancement/studio-media-role';

export function intakeMediaRefs(key: string, config: ConfigService) {
  const prefix = (config.get<string>('app.apiPrefix') ?? 'api').replace(/^\/+|\/+$/g, '');
  const base = config.get<string>('app.publicBaseUrl')?.replace(/\/+$/, '');
  return [
    ...new Set([
      `/${prefix}/media/${key}`,
      `/api/media/${key}`,
      `api/media/${key}`,
      ...(base ? [`${base}/${prefix}/media/${key}`, `${base}/api/media/${key}`] : []),
    ]),
  ];
}
export async function publishedIntakeMedia(
  db: Prisma.TransactionClient,
  key: string,
  productId: string | null,
  config: ConfigService,
) {
  if (!productId) return false;
  const candidate = await db.productImageEnhancementCandidate.findFirst({
    where: { asset: { key } },
    select: { mediaRole: true, job: { select: { mode: true, parameters: true } } },
  });
  // Promotion publication needs a separately authorized, labeled secondary-media
  // workflow. A factual-product association cannot accidentally expose it.
  if (candidate && isPromotionalCandidate(candidate)) return false;
  return !!(await db.productListing.findFirst({
    where: {
      id: productId,
      status: 'ACTIVE',
      availableQuantity: { gt: 0 },
      imageUrls: { hasSome: intakeMediaRefs(key, config) },
    },
    select: { id: true },
  }));
}
