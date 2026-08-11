import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ShipRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shippingCompany?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingPrice?: number;
}

