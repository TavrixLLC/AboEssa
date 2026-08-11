import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateVirtualCustomerDto {
  @ApiProperty({ example: 'TikTok Ahmed' })
  @IsString()
  displayName: string;

  @ApiPropertyOptional({ example: '+9647700000000' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  @ApiPropertyOptional({ example: '@ahmed_live' })
  @IsOptional()
  @IsString()
  tiktokUsername?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

