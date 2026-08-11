import { AuctionStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

const auctionSortFields = ['createdAt', 'updatedAt', 'startsAt', 'endsAt', 'currentPrice', 'title', 'status'] as const;
const sortOrders = ['asc', 'desc'] as const;

export class AuctionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AuctionStatus })
  @IsOptional()
  @IsEnum(AuctionStatus)
  status?: AuctionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: auctionSortFields, default: 'endsAt' })
  @IsOptional()
  @IsIn(auctionSortFields)
  sortBy?: (typeof auctionSortFields)[number];

  @ApiPropertyOptional({ enum: sortOrders, default: 'asc' })
  @IsOptional()
  @IsIn(sortOrders)
  sortOrder?: (typeof sortOrders)[number];
}
