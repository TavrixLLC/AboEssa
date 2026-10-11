import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuctionRarity } from '@prisma/client';

export class MarketplaceItemDto {
  @ApiProperty({ enum: ['PRODUCT', 'AUCTION'] })
  itemType: 'PRODUCT' | 'AUCTION';

  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiProperty()
  categoryId: string;

  @ApiPropertyOptional({ nullable: true })
  categoryName?: string | null;

  @ApiProperty({ type: [String] })
  imageUrls: string[];

  @ApiPropertyOptional({ nullable: true })
  primaryImageUrl?: string | null;

  @ApiProperty()
  status: string;

  @ApiProperty({ example: '15000.00' })
  displayPrice: string;

  @ApiProperty()
  isAvailable: boolean;

  @ApiPropertyOptional()
  productId?: string;

  @ApiPropertyOptional({ enum: AuctionRarity, nullable: true })
  rarity?: AuctionRarity | null;

  @ApiPropertyOptional({ example: '15000.00' })
  price?: string;

  @ApiPropertyOptional({ example: '15000.00' })
  originalPrice?: string;

  @ApiPropertyOptional({ example: '12000.00' })
  discountedPrice?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 99, nullable: true })
  discountPercentage?: number | null;

  @ApiPropertyOptional()
  hasDiscount?: boolean;

  @ApiPropertyOptional()
  totalQuantity?: number;

  @ApiPropertyOptional()
  availableQuantity?: number;

  @ApiPropertyOptional()
  soldQuantity?: number;

  @ApiPropertyOptional()
  isOutOfStock?: boolean;

  @ApiPropertyOptional()
  auctionId?: string;

  @ApiPropertyOptional({ example: '1000.00' })
  startingPrice?: string;

  @ApiPropertyOptional({ example: '1500.00' })
  currentPrice?: string;

  @ApiPropertyOptional({ example: '500.00' })
  minIncrement?: string;

  @ApiPropertyOptional({ example: '2000.00' })
  minimumNextBid?: string;

  @ApiPropertyOptional()
  startsAt?: Date;

  @ApiPropertyOptional()
  endsAt?: Date;

  @ApiPropertyOptional()
  serverTime?: string;

  @ApiPropertyOptional()
  isLive?: boolean;

  @ApiPropertyOptional()
  isEnded?: boolean;

  @ApiPropertyOptional()
  canBid?: boolean;

  @ApiPropertyOptional()
  totalBids?: number;

  @ApiPropertyOptional({ nullable: true })
  myHighestBid?: string | null;

  @ApiPropertyOptional({ nullable: true })
  isWinning?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  isOutbid?: boolean | null;

  @ApiProperty()
  createdAt: Date;
}

export class MarketplaceListResponseDto {
  @ApiProperty()
  serverTime: string;

  @ApiProperty({ type: [MarketplaceItemDto] })
  items: MarketplaceItemDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
