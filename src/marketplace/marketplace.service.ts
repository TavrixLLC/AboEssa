import { Injectable } from '@nestjs/common';
import { AuctionStatus, Prisma, ProductListingStatus } from '@prisma/client';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { MarketplaceQueryDto } from 'src/marketplace/dto/marketplace-query.dto';
import { MarketplaceItemDto } from 'src/marketplace/dto/marketplace-response.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: MarketplaceQueryDto, customerId?: string) {
    const pagination = getPagination(query);
    const serverTime = new Date();
    const requestedStatus = query.status?.toUpperCase();
    const includeProducts =
      query.itemType !== 'AUCTION' && (!requestedStatus || requestedStatus === ProductListingStatus.ACTIVE);
    const includeAuctions =
      query.itemType !== 'PRODUCT' && (!requestedStatus || requestedStatus === AuctionStatus.ACTIVE);
    const takeForMerge = pagination.skip + pagination.take;

    const productWhere: Prisma.ProductListingWhereInput = {
      status: ProductListingStatus.ACTIVE,
      availableQuantity: { gt: 0 },
      categoryId: query.categoryId,
      OR: this.search(query.search),
    };
    const auctionWhere: Prisma.AuctionWhereInput = {
      status: AuctionStatus.ACTIVE,
      endsAt: { gt: serverTime },
      categoryId: query.categoryId,
      OR: this.search(query.search),
    };

    const [products, productTotal, auctions, auctionTotal] = await this.prisma.$transaction([
      includeProducts
        ? this.prisma.productListing.findMany({
            where: productWhere,
            include: { category: true },
            orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
            take: takeForMerge,
          })
        : this.prisma.productListing.findMany({ where: { id: '__none__' }, take: 0 }),
      includeProducts ? this.prisma.productListing.count({ where: productWhere }) : this.prisma.productListing.count({ where: { id: '__none__' } }),
      includeAuctions
        ? this.prisma.auction.findMany({
            where: auctionWhere,
            include: {
              category: true,
              winningBid: true,
              _count: { select: { bids: true } },
              bids: customerId
                ? {
                    where: { customerId },
                    orderBy: { amount: 'desc' },
                    take: 1,
                  }
                : false,
            },
            orderBy: [{ endsAt: 'asc' }, { createdAt: 'desc' }],
            take: takeForMerge,
          })
        : this.prisma.auction.findMany({ where: { id: '__none__' }, take: 0 }),
      includeAuctions ? this.prisma.auction.count({ where: auctionWhere }) : this.prisma.auction.count({ where: { id: '__none__' } }),
    ]);

    const items = [
      ...products.map((product) => this.toProductItem(product)),
      ...auctions.map((auction) => this.toAuctionItem(auction, serverTime, customerId)),
    ];
    items.sort((left, right) => this.compareItems(left, right, query));

    return {
      serverTime: serverTime.toISOString(),
      ...toPaginatedResult(
        items.slice(pagination.skip, pagination.skip + pagination.take),
        productTotal + auctionTotal,
        pagination.page,
        pagination.limit,
      ),
    };
  }

  private toProductItem(product: Record<string, any>): MarketplaceItemDto {
    const price = this.toMoney(product.price);
    return {
      itemType: 'PRODUCT',
      id: product.id,
      productId: product.id,
      title: product.title,
      description: product.description,
      categoryId: product.categoryId,
      categoryName: product.category?.name ?? null,
      imageUrls: product.imageUrls ?? [],
      primaryImageUrl: product.imageUrls?.[0] ?? null,
      status: product.status,
      displayPrice: price,
      price,
      totalQuantity: product.totalQuantity,
      availableQuantity: product.availableQuantity,
      soldQuantity: product.soldQuantity,
      isOutOfStock: product.availableQuantity <= 0,
      isAvailable: product.status === ProductListingStatus.ACTIVE && product.availableQuantity > 0,
      createdAt: product.createdAt,
    };
  }

  private toAuctionItem(auction: Record<string, any>, serverTime: Date, customerId?: string): MarketplaceItemDto {
    const minimumNextBid = new Prisma.Decimal(auction.currentPrice).plus(auction.minIncrement);
    const isLive = auction.status === AuctionStatus.ACTIVE && auction.startsAt <= serverTime && auction.endsAt > serverTime;
    const isEnded = auction.status === AuctionStatus.ENDED || auction.status === AuctionStatus.CANCELLED || auction.endsAt <= serverTime;
    const myBid = Array.isArray(auction.bids) ? auction.bids[0] : undefined;
    const isWinning = customerId ? auction.winningBid?.customerId === customerId : null;
    const currentPrice = this.toMoney(auction.currentPrice);
    return {
      itemType: 'AUCTION',
      id: auction.id,
      auctionId: auction.id,
      title: auction.title,
      description: auction.description,
      categoryId: auction.categoryId,
      categoryName: auction.category?.name ?? null,
      imageUrls: auction.imageUrls ?? [],
      primaryImageUrl: auction.imageUrls?.[0] ?? null,
      status: auction.status,
      displayPrice: currentPrice,
      isAvailable: isLive,
      startingPrice: this.toMoney(auction.startingPrice),
      currentPrice,
      minIncrement: this.toMoney(auction.minIncrement),
      minimumNextBid: this.toMoney(minimumNextBid),
      startsAt: auction.startsAt,
      endsAt: auction.endsAt,
      serverTime: serverTime.toISOString(),
      isLive,
      isEnded,
      canBid: isLive,
      totalBids: auction._count?.bids ?? 0,
      myHighestBid: myBid ? this.toMoney(myBid.amount) : null,
      isWinning,
      isOutbid: myBid ? !isWinning : false,
      createdAt: auction.createdAt,
    };
  }

  private compareItems(left: MarketplaceItemDto, right: MarketplaceItemDto, query: MarketplaceQueryDto) {
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    switch (query.sortBy) {
      case 'createdAt':
        return direction * (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
      case 'price':
        return direction * (Number(left.displayPrice) - Number(right.displayPrice));
      case 'title':
        return direction * left.title.localeCompare(right.title);
      case 'endsAt':
        return direction * ((left.endsAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.endsAt?.getTime() ?? Number.MAX_SAFE_INTEGER));
      default:
        return this.marketplaceRank(left) - this.marketplaceRank(right) || this.defaultTimeRank(left) - this.defaultTimeRank(right);
    }
  }

  private marketplaceRank(item: MarketplaceItemDto) {
    if (item.itemType === 'AUCTION' && item.isLive) {
      return 0;
    }
    if (item.itemType === 'PRODUCT') {
      return 1;
    }
    return 2;
  }

  private defaultTimeRank(item: MarketplaceItemDto) {
    if (item.itemType === 'AUCTION' && item.endsAt) {
      return item.endsAt.getTime();
    }
    return -new Date(item.createdAt).getTime();
  }

  private search(search?: string) {
    return search
      ? [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ]
      : undefined;
  }

  private toMoney(value: Prisma.Decimal | number | string) {
    return new Prisma.Decimal(value).toFixed(2);
  }
}
