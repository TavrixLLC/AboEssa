import { AuctionTier } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateAuctionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  categoryId: string;

  @ApiPropertyOptional({ enum: AuctionTier, default: AuctionTier.NORMAL })
  @IsOptional()
  @IsEnum(AuctionTier)
  tier?: AuctionTier;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  imageUrls?: string[];

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  startingPrice: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  minIncrement: number;

  @ApiProperty()
  @IsDateString()
  startsAt: string;

  @ApiProperty()
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  extensionSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  extensionTriggerSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxExtensions?: number;
}
