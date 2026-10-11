import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CheckoutPaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CheckoutDeliveryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  governorate: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  addressLine: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  nearestPoint?: string;
}

export class CheckoutDto {
  @ApiProperty({ enum: CheckoutPaymentMethod })
  @IsEnum(CheckoutPaymentMethod)
  paymentMethod: CheckoutPaymentMethod;

  @ApiProperty({ type: CheckoutDeliveryDto })
  @ValidateNested()
  @Type(() => CheckoutDeliveryDto)
  delivery: CheckoutDeliveryDto;
}
