import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProductIntakeSession } from '@prisma/client';
import { AppException } from 'src/common/exceptions/app.exception';
import { PrismaService } from 'src/prisma/prisma.service';
import { InventoryTx, inventoryHash } from 'src/inventory/inventory-ledger';
import { normalizedCatalogText } from 'src/catalog/catalog.service';
import { aiSettings } from './ai.config';

export const duplicateText = (s: string) =>
  normalizedCatalogText(s.normalize('NFKC'))
    .replace(/[٠-٩۰-۹]/g, (c) => String(c.charCodeAt(0) - (c <= '٩' ? 1632 : 1776)))
    .replace(/[^\p{L}\p{N}.]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
export function variantIdentity(s: string) {
  const text = duplicateText(s),
    sizes: string[] = [],
    models: string[] = [];
  // Arabic unit boundaries cannot use JS \b (ASCII only).
  const unit =
    /(\d+(?:\.\d+)?)\s*(ml|ملل?|l|لتر|litre|liter|kg|كغ|كغم|كيلو|g|غرام|غ|gram|gb|جيجا|tb|تيرا)(?=\s|$)/giu;
  for (const match of text.matchAll(unit)) {
    const u = match[2],
      value = new Prisma.Decimal(match[1]);
    if (['ml', 'مل', 'ملل', 'l', 'لتر', 'litre', 'liter'].includes(u))
      sizes.push(
        'volume:' + value.mul(['l', 'لتر', 'litre', 'liter'].includes(u) ? 1000 : 1).toString(),
      );
    else if (['gb', 'جيجا', 'tb', 'تيرا'].includes(u))
      sizes.push('memory:' + value.mul(['tb', 'تيرا'].includes(u) ? 1024 : 1).toString());
    else
      sizes.push(
        'weight:' + value.mul(['kg', 'كغ', 'كغم', 'كيلو'].includes(u) ? 1000 : 1).toString(),
      );
  }
  for (const word of text.split(' '))
    if (
      /^(?=.*[a-z])(?=.*\d)[a-z\d.-]{3,}$/i.test(word) &&
      !/^\d+(?:\.\d+)?(?:ml|l|kg|g|gb|tb)$/i.test(word)
    )
      models.push(word);
  const colorGroups = [
    ['اسود', 'black'],
    ['ابيض', 'white'],
    ['احمر', 'red'],
    ['ازرق', 'blue'],
    ['اخضر', 'green'],
    ['ذهبي', 'gold'],
    ['فضي', 'silver'],
    ['وردي', 'pink'],
  ];
  const colors = colorGroups
    .filter((group) => group.some((c) => text.split(' ').includes(c)))
    .map((g) => g[1]);
  const pack = text.match(/(?:pack|عبوه|عبوة|عدد)\s*(\d+)/)?.[1] ?? null;
  return {
    text,
    base: text
      .replace(unit, ' ')
      .split(' ')
      .filter(Boolean)
      .map((word) => colorGroups.find((group) => group.includes(word))?.[1] ?? word)
      .sort()
      .join(' '),
    sizes: [...new Set(sizes)].sort(),
    models: [...new Set(models)].sort(),
    colors: colors.sort(),
    pack,
  };
}
const overlap = (a: string[], b: string[]) => a.some((v) => b.includes(v));
type Candidate = {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  status: string;
  availableQuantity: number;
  imageUrl: string | null;
} & ReturnType<typeof rankDuplicate>;
export function rankDuplicate(query: string, title: string) {
  const q = variantIdentity(query),
    p = variantIdentity(title),
    conflicts: string[] = [],
    reasons: string[] = [];
  for (const key of ['models', 'colors'] as const)
    if (q[key].length && p[key].length && q[key].join('|') !== p[key].join('|'))
      conflicts.push(`${key.toUpperCase()}_CONFLICT`);
  for (const dimension of ['volume:', 'weight:', 'memory:']) {
    const a = q.sizes.filter((s) => s.startsWith(dimension)),
      b = p.sizes.filter((s) => s.startsWith(dimension));
    if (a.length && b.length && a.join('|') !== b.join('|')) conflicts.push('SIZES_CONFLICT');
  }
  if (q.pack && p.pack && q.pack !== p.pack) conflicts.push('PACK_CONFLICT');
  const a = new Set(q.text.split(' ')),
    b = new Set(p.text.split(' '));
  const shared = [...a].filter((t) => b.has(t)).length;
  const score = shared / (a.size + b.size - shared || 1);
  if (q.text === p.text) reasons.push('NORMALIZED_TITLE_MATCH');
  if (overlap(q.models, p.models)) reasons.push('VISIBLE_MODEL_MATCH');
  if (overlap(q.sizes, p.sizes)) reasons.push('SIZE_MATCH');
  if (!q.sizes.length || !p.sizes.length) reasons.push('SIZE_UNKNOWN_NOT_EXACT');
  if (shared) reasons.push('SHARED_TITLE_TERMS');
  const strong =
    !conflicts.length &&
    !!q.text &&
    (q.text === p.text ||
      (q.base === p.base && q.sizes.length > 0 && q.sizes.join('|') === p.sizes.join('|')));
  return {
    score: Math.round((conflicts.length ? score * 0.3 : score) * 1000) / 1000,
    strong,
    reasons,
    conflicts,
    label: conflicts.length ? 'VARIANT_CONFLICT' : 'POSSIBLE_MATCH',
    scoreMeaning: 'HEURISTIC_NOT_PROBABILITY',
  };
}
export const duplicateIdentity = (s: ProductIntakeSession) =>
  inventoryHash([s.approvedMetadata, s.selectedImageKey, s.mode]);
@Injectable()
export class DuplicateDetectionService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}
  get enabled() {
    return aiSettings(this.config).enabled;
  }
  async candidates(title: string, client?: InventoryTx): Promise<Candidate[]> {
    if (!this.enabled || duplicateText(title).length < 3) return [];
    if (!client) return this.db.$transaction((tx) => this.candidates(title, tx));
    const text = duplicateText(title).slice(0, 200),
      terms = text
        .split(' ')
        .filter((t) => t.length >= 3)
        .sort((a, b) => b.length - a.length)
        .slice(0, 2);
    const anchor = terms.map((t) => Prisma.sql`catalog_search(p."title") LIKE ${'%' + t + '%'}`);
    const rows = await client.$queryRaw<
      {
        id: string;
        title: string;
        categoryId: string;
        categoryName: string;
        status: string;
        availableQuantity: number;
        imageUrl: string | null;
      }[]
    >(Prisma.sql`
      SELECT p.id,p.title,p."categoryId",c.name AS "categoryName",p.status::text AS status,p."availableQuantity",p."imageUrls"[1] AS "imageUrl"
      FROM "ProductListing" p JOIN "Category" c ON c.id=p."categoryId" WHERE p.status IN ('ACTIVE','DRAFT','SOLD','CANCELLED') AND
      (catalog_search(p.title) % ${text} ${anchor.length ? Prisma.sql`OR (${Prisma.join(anchor, ' OR ')})` : Prisma.empty})
      ORDER BY similarity(catalog_search(p.title),${text}) DESC,p.id LIMIT 60`);
    return rows
      .map((p) => ({ ...p, ...rankDuplicate(title, p.title) }))
      .filter((p) => p.score > 0)
      .sort(
        (a, b) =>
          Number(b.strong) - Number(a.strong) || b.score - a.score || a.id.localeCompare(b.id),
      )
      .slice(0, 5);
  }
  async review(s: ProductIntakeSession, client?: InventoryTx) {
    const m = s.approvedMetadata as { title?: string };
    const candidates = await this.candidates(m.title ?? '', client);
    const strong = candidates.filter((c) => c.strong);
    return {
      revision: s.revision,
      identityHash: duplicateIdentity(s),
      candidates,
      candidatesHash: inventoryHash(
        strong
          .map((p) => [p.id, p.title, p.categoryId])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ),
      needsReview: strong.length > 0,
    };
  }
  async assertNewAllowed(tx: InventoryTx, s: ProductIntakeSession) {
    if (!this.enabled) return;
    const review = await this.review(s, tx);
    if (!review.needsReview) return;
    const decision = await tx.intakeDuplicateDecision.findUnique({ where: { sessionId: s.id } });
    if (
      decision?.action === 'DISTINCT_PRODUCT' &&
      decision.revision === s.revision &&
      decision.identityHash === review.identityHash &&
      decision.candidatesHash === review.candidatesHash
    )
      return;
    throw new AppException(
      'راجع المنتجات المشابهة قبل إنشاء منتج جديد',
      'AI_DUPLICATE_REVIEW_REQUIRED',
      409,
      review,
    );
  }
}
