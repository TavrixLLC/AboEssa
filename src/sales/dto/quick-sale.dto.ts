import { SaleSource } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateVirtualCustomerDto } from 'src/customers/dto/create-virtual-customer.dto';

const CURRENT_QUICK_SALE_SOURCES = [
  SaleSource.TIKTOK_LIVE_MANUAL,
  SaleSource.ADMIN_MANUAL,
] as const;

export class QuickSaleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ type: CreateVirtualCustomerDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateVirtualCustomerDto)
  createVirtualCustomer?: CreateVirtualCustomerDto;

  @ApiProperty({ example: 4000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty()
  @IsString()
  categoryId: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity?: number;

  @ApiProperty({ enum: CURRENT_QUICK_SALE_SOURCES, example: SaleSource.ADMIN_MANUAL })
  @IsIn(CURRENT_QUICK_SALE_SOURCES)
  source: SaleSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  snapshotUrl?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isBroken?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isGift?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isReplacement?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salesSessionId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  printNow?: boolean;
}
