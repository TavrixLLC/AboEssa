import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tiktokUsername?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchaseLimitOverride?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trustLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

