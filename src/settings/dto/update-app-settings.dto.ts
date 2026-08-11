import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateAppSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storePhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeAddress?: string;

  @ApiPropertyOptional({ default: 'IQD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowUnverifiedPurchase?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unverifiedPurchaseLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowUnverifiedBidding?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unverifiedBidLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  defaultAuctionExtensionSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  defaultAuctionExtensionTriggerSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  defaultLiveAuctionResetSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  defaultLongAuctionExtensionSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  auctionEndingSoonNotifyMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxAuctionExtensions?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  labelTemplate?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shippingRequestEnabled?: boolean;
}

