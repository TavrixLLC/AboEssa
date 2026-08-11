import { SaleSource } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

export class WarehouseLabelPendingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SaleSource })
  @IsOptional()
  @IsEnum(SaleSource)
  source?: SaleSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

