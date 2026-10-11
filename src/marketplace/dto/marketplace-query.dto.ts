import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuctionRarityInput, auctionRarityInputs } from 'src/auctions/auction-rarity.compat';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

const marketplaceItemTypes = ['PRODUCT', 'AUCTION'] as const;
const marketplaceSortFields = ['marketplace', 'createdAt', 'price', 'title', 'endsAt'] as const;
const sortOrders = ['asc', 'desc'] as const;

export class MarketplaceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: marketplaceItemTypes })
  @IsOptional()
  @IsIn(marketplaceItemTypes)
  itemType?: (typeof marketplaceItemTypes)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ enum: auctionRarityInputs })
  @IsOptional()
  @IsIn(auctionRarityInputs)
  rarity?: AuctionRarityInput;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'ProductListingStatus or AuctionStatus value' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: marketplaceSortFields, default: 'marketplace' })
  @IsOptional()
  @IsIn(marketplaceSortFields)
  sortBy?: (typeof marketplaceSortFields)[number];

  @ApiPropertyOptional({ enum: sortOrders, default: 'desc' })
  @IsOptional()
  @IsIn(sortOrders)
  sortOrder?: (typeof sortOrders)[number];
}
