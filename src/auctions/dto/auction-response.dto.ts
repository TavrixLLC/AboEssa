import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuctionStatus, AuctionTier, BidStatus } from '@prisma/client';

export class AuctionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty()
  categoryId: string;

  @ApiPropertyOptional({ nullable: true })
  categoryName: string | null;

  @ApiProperty({ type: [String] })
  imageUrls: string[];

  @ApiProperty({ enum: AuctionStatus })
  status: AuctionStatus;

  @ApiProperty({ enum: AuctionTier, default: AuctionTier.NORMAL })
  tier: AuctionTier;

  @ApiProperty()
  isVip: boolean;

  @ApiProperty({ example: '1000' })
  startingPrice: string;

  @ApiProperty({ example: '1500' })
  currentPrice: string;

  @ApiProperty({ example: '500' })
  minIncrement: string;

  @ApiProperty({ example: '2000' })
  minimumNextBid: string;

  @ApiProperty()
  startsAt: Date;

  @ApiProperty()
  endsAt: Date;

  @ApiProperty({ example: '2026-07-13T12:00:00.000Z' })
  serverTime: string;

  @ApiProperty()
  isLive: boolean;

  @ApiProperty()
  isEnded: boolean;

  @ApiProperty()
  totalBids: number;

  @ApiPropertyOptional({ nullable: true })
  winnerCustomerId?: string | null;

  @ApiPropertyOptional()
  extensionSeconds?: number;

  @ApiPropertyOptional()
  extensionTriggerSeconds?: number;

  @ApiPropertyOptional()
  maxExtensions?: number;

  @ApiPropertyOptional()
  extensionCount?: number;

  @ApiPropertyOptional({ example: '1500', nullable: true })
  myHighestBid?: string | null;

  @ApiPropertyOptional({ nullable: true })
  isWinning?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  isOutbid?: boolean | null;

  @ApiPropertyOptional()
  canBid?: boolean;

  @ApiPropertyOptional({ nullable: true })
  bidDisabledReason?: string | null;

  @ApiPropertyOptional({ nullable: true })
  winnerCustomer?: unknown;
}

export class AuctionListResponseDto {
  @ApiProperty({ example: '2026-07-13T12:00:00.000Z' })
  serverTime: string;

  @ApiProperty({ type: [AuctionResponseDto] })
  items: AuctionResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class BidResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  auctionId: string;

  @ApiProperty()
  customerId: string;

  @ApiProperty({ example: '1500' })
  amount: string;

  @ApiProperty({ enum: BidStatus })
  status: BidStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  placedAt: Date;

  @ApiPropertyOptional({ nullable: true })
  customer?: unknown;
}

export class PlaceBidResultDto {
  @ApiProperty()
  auctionId: string;

  @ApiProperty()
  bidId: string;

  @ApiProperty({ example: '1500' })
  amount: string;

  @ApiProperty({ example: '1500' })
  currentPrice: string;

  @ApiProperty({ example: '2000' })
  minimumNextBid: string;

  @ApiProperty()
  endsAt: Date;

  @ApiProperty({ example: '2026-07-13T12:00:00.000Z' })
  serverTime: string;

  @ApiProperty()
  isWinning: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  auction: AuctionResponseDto;

  @ApiProperty()
  bid: BidResponseDto;
}
