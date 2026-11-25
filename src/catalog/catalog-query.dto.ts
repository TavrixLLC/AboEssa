import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CatalogQueryDto {
  @IsOptional() @IsString() @MaxLength(1800) cursor?: string;
  @IsOptional() @IsString() @MaxLength(100) categoryId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsBooleanString() discountedOnly?: string;
  @IsOptional() @IsIn(['LEGENDARY', 'RARE', 'FEATURED']) rarity?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(40) limit = 20;
}

export class CatalogMediaQueryDto {
  @IsString() @MaxLength(6000) keys: string;
}
