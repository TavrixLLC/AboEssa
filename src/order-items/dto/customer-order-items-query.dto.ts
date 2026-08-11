import { OrderItemStatus, SaleSource } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

export class CustomerOrderItemsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderItemStatus })
  @IsOptional()
  @IsEnum(OrderItemStatus)
  status?: OrderItemStatus;

  @ApiPropertyOptional({ enum: SaleSource })
  @IsOptional()
  @IsEnum(SaleSource)
  source?: SaleSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

