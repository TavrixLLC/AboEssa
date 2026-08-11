import { LiveSessionSource } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const CURRENT_SALES_SESSION_SOURCES = [
  LiveSessionSource.TIKTOK_EXTERNAL,
  LiveSessionSource.MANUAL,
] as const;

export class StartSalesSessionDto {
  @ApiProperty({ example: 'TikTok sales shift 2026-07-13' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({ enum: CURRENT_SALES_SESSION_SOURCES, example: LiveSessionSource.TIKTOK_EXTERNAL })
  @IsIn(CURRENT_SALES_SESSION_SOURCES)
  source: LiveSessionSource;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  forceNew?: boolean;
}
