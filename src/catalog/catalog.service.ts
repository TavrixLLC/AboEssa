import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AppException } from 'src/common/exceptions/app.exception';
import { PrismaService } from 'src/prisma/prisma.service';
import { CatalogQueryDto } from './catalog-query.dto';

type Boundary = { time: string; id: string } | null;
type Cursor = {
  v: 1;
  query: string;
  product: Boundary;
  auction: Boundary;
  turn: 'PRODUCT' | 'AUCTION';
  page: number;
};
export function normalizedCatalogText(text: string) {
  return text
    .toLowerCase()
    .replace(/[ً-ٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim()
    .replace(/\s+/g, ' ');
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(kind: 'products' | 'auctions' | 'marketplace', q: CatalogQueryDto) {
    const limit = q.limit ?? 20;
    const signature = createHash('sha256')
      .update(
        JSON.stringify([
          kind,
          limit,
          q.categoryId ?? '',
          normalizedCatalogText(q.search ?? ''),
          q.discountedOnly === 'true',
          q.rarity ?? '',
        ]),
      )
      .digest('hex')
      .slice(0, 24);
    const cursor = this.cursor(q.cursor, signature);
    const productWhere = this.where('PRODUCT', q, cursor.product);
    const auctionWhere = this.where('AUCTION', q, cursor.auction);
    // Stable immutable creation order: price/stock and auction extensions cannot
    // move an already viewed item to another page.
    const products =
      kind === 'auctions'
        ? []
        : await this.read('PRODUCT', productWhere, limit + 1, !!q.search?.trim());
    const auctions =
      kind === 'products'
        ? []
        : await this.read('AUCTION', auctionWhere, limit + 1, !!q.search?.trim());
    const items: Record<string, any>[] = [];
    let p = 0,
      a = 0,
      turn = cursor.turn;
    while (items.length < limit && (p < products.length || a < auctions.length)) {
      if ((turn === 'PRODUCT' && p < products.length) || a === auctions.length) {
        items.push(this.card(products[p++], 'PRODUCT'));
        turn = 'AUCTION';
      } else {
        items.push(this.card(auctions[a++], 'AUCTION'));
        turn = 'PRODUCT';
      }
    }
    const hasMore = p < products.length || a < auctions.length;
    const boundary = (rows: Record<string, any>[], consumed: number, previous: Boundary) =>
      consumed
        ? { time: rows[consumed - 1].createdAt.toISOString(), id: rows[consumed - 1].id }
        : previous;
    const next = {
      ...cursor,
      product: boundary(products, p, cursor.product),
      auction: boundary(auctions, a, cursor.auction),
      turn,
      page: cursor.page + 1,
    };
    return {
      items,
      serverTime: new Date().toISOString(),
      meta: {
        page: cursor.page,
        limit,
        hasMore,
        nextCursor: hasMore ? Buffer.from(JSON.stringify(next)).toString('base64url') : null,
      },
    };
  }

  private cursor(encoded: string | undefined, query: string): Cursor {
    if (!encoded) return { v: 1, query, product: null, auction: null, turn: 'PRODUCT', page: 1 };
    try {
      const c = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      const valid = (b: Boundary) =>
        b === null ||
        (b &&
          typeof b.id === 'string' &&
          /^[a-zA-Z0-9_-]{1,80}$/.test(b.id) &&
          typeof b.time === 'string' &&
          /^\d{4}-\d{2}-\d{2}T/.test(b.time) &&
          Number.isFinite(Date.parse(b.time)));
      if (
        c.v !== 1 ||
        c.query !== query ||
        !valid(c.product) ||
        !valid(c.auction) ||
        !['PRODUCT', 'AUCTION'].includes(c.turn) ||
        !Number.isSafeInteger(c.page) ||
        c.page < 1 ||
        c.page > 1_000_000
      )
        throw new Error();
      return c;
    } catch {
      throw new AppException(
        'Invalid catalog cursor for these filters',
        'INVALID_CATALOG_CURSOR',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private where(type: 'PRODUCT' | 'AUCTION', q: CatalogQueryDto, boundary: Boundary) {
    const clauses = [Prisma.sql`p."status" = 'ACTIVE'`];
    if (type === 'PRODUCT') {
      clauses.push(Prisma.sql`p."availableQuantity" > 0`);
      if (q.discountedOnly === 'true') clauses.push(Prisma.sql`p."discountPercentage" IS NOT NULL`);
    } else {
      clauses.push(Prisma.sql`p."endsAt" > NOW()`);
      if (q.rarity) clauses.push(Prisma.sql`p."rarity"::text = ${q.rarity}`);
    }
    if (q.categoryId) clauses.push(Prisma.sql`p."categoryId" = ${q.categoryId}`);
    if (q.search?.trim()) {
      const term = normalizedCatalogText(q.search).replace(/[\\%_]/g, '\\$&');
      const pattern = '%' + term + '%';
      clauses.push(Prisma.sql`(catalog_search(p."title") LIKE ${pattern}
        OR catalog_search(COALESCE(p."description", '')) LIKE ${pattern})`);
    }
    if (boundary)
      clauses.push(
        Prisma.sql`(p."createdAt", p."id") < (${new Date(boundary.time)}, ${boundary.id})`,
      );
    return Prisma.join(clauses, ' AND ');
  }

  private read(type: 'PRODUCT' | 'AUCTION', where: Prisma.Sql, limit: number, searching: boolean) {
    const table = type === 'PRODUCT' ? Prisma.sql`"ProductListing"` : Prisma.sql`"Auction"`;
    const specific =
      type === 'PRODUCT'
        ? Prisma.sql`p."price", p."discountPercentage", p."totalQuantity", p."availableQuantity", p."soldQuantity"`
        : Prisma.sql`p."currentPrice", p."startingPrice", p."minIncrement", p."startsAt", p."endsAt", p."rarity", p."tier",
          (SELECT COUNT(*)::int FROM "Bid" b WHERE b."auctionId" = p."id") AS "totalBids"`;
    if (searching) {
      // Prevent the LIMIT plan from scanning the date index and normalizing
      // every description. Materialize only matching IDs, not full products.
      return this.prisma.$queryRaw<Record<string, any>[]>(Prisma.sql`
        WITH matches AS MATERIALIZED (SELECT p."id" FROM ${table} p WHERE ${where})
        SELECT p."id", p."title", p."categoryId", c."name" AS "categoryName",
          p."imageUrls"[1] AS "primaryImageUrl", p."createdAt", ${specific}
        FROM matches m JOIN ${table} p ON p."id" = m."id"
        JOIN "Category" c ON c."id" = p."categoryId"
        ORDER BY p."createdAt" DESC, p."id" DESC LIMIT ${limit}
      `);
    }
    return this.prisma.$queryRaw<Record<string, any>[]>(Prisma.sql`
      SELECT p."id", p."title", p."categoryId", c."name" AS "categoryName",
        p."imageUrls"[1] AS "primaryImageUrl", p."createdAt", ${specific}
      FROM ${table} p JOIN "Category" c ON c."id" = p."categoryId"
      WHERE ${where} ORDER BY p."createdAt" DESC, p."id" DESC LIMIT ${limit}
    `);
  }

  private card(row: Record<string, any>, type: 'PRODUCT' | 'AUCTION') {
    const common = {
      ...row,
      itemType: type,
      status: 'ACTIVE',
      imageUrls: row.primaryImageUrl ? [row.primaryImageUrl] : [],
    };
    if (type === 'PRODUCT') {
      const original = new Prisma.Decimal(row.price);
      const price = original
        .mul(100 - (row.discountPercentage ?? 0))
        .div(100)
        .toFixed(2);
      return {
        ...common,
        price,
        displayPrice: price,
        originalPrice: original.toFixed(2),
        discountedPrice: price,
        hasDiscount: row.discountPercentage != null,
        isAvailable: true,
        isOutOfStock: false,
      };
    }
    const live = row.startsAt <= new Date();
    return {
      ...common,
      displayPrice: row.currentPrice.toFixed(2),
      currentPrice: row.currentPrice.toFixed(2),
      startingPrice: row.startingPrice.toFixed(2),
      minIncrement: row.minIncrement.toFixed(2),
      minimumNextBid: row.currentPrice.plus(row.minIncrement).toFixed(2),
      bidDepositPercent: 10,
      isLive: live,
      isEnded: false,
      isAvailable: live,
      canBid: live,
    };
  }
}
