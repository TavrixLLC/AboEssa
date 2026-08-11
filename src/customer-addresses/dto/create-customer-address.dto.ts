import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCustomerAddressDto {
  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiProperty()
  @IsString()
  phone: string;

  @ApiProperty()
  @IsString()
  governorate: string;

  @ApiProperty()
  @IsString()
  city: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  addressLine: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nearestPoint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

