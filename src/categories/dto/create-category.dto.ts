import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Electronics' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'electronics' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

