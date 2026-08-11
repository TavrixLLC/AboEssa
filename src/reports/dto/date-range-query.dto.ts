import { SaleSource } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class DateRangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: SaleSource })
  @IsOptional()
  @IsEnum(SaleSource)
  source?: SaleSource;
}

