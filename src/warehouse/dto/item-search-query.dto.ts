import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ItemSearchQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

