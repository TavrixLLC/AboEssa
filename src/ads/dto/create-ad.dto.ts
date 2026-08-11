import { AdLinkType, AdPlacement, AdTargetType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { CURRENT_AD_LINK_TYPES, CURRENT_AD_PLACEMENTS } from 'src/ads/ads.constants';

export class CreateAdDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty()
  @IsString()
  body: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ enum: CURRENT_AD_PLACEMENTS })
  @IsIn(CURRENT_AD_PLACEMENTS)
  placement: AdPlacement;

  @ApiProperty({ enum: AdTargetType })
  @IsEnum(AdTargetType)
  targetType: AdTargetType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetCategoryId?: string;

  @ApiProperty({ enum: CURRENT_AD_LINK_TYPES })
  @IsIn(CURRENT_AD_LINK_TYPES)
  linkType: AdLinkType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkTargetId?: string;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiProperty()
  @IsDateString()
  startsAt: string;

  @ApiProperty()
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
