import { ProductListingStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

const productSortFields = ['createdAt', 'updatedAt', 'publishedAt', 'price', 'title', 'status'] as const;
const sortOrders = ['asc', 'desc'] as const;

export class ProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProductListingStatus })
  @IsOptional()
  @IsEnum(ProductListingStatus)
  status?: ProductListingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: productSortFields, default: 'createdAt' })
  @IsOptional()
  @IsIn(productSortFields)
  sortBy?: (typeof productSortFields)[number];

  @ApiPropertyOptional({ enum: sortOrders, default: 'desc' })
  @IsOptional()
  @IsIn(sortOrders)
  sortOrder?: (typeof sortOrders)[number];
}
