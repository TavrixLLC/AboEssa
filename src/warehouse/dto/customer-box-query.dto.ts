import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

export class CustomerBoxQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minItems?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hasPendingLabels?: boolean;

  @ApiPropertyOptional({ example: 'lastItemAt_desc' })
  @IsOptional()
  @IsString()
  sort?: string;
}

