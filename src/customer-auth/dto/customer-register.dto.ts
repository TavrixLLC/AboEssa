import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CustomerRegisterDto {
  @ApiProperty({ example: 'أحمد' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName: string;

  @ApiProperty({ example: '+9647700000000' })
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  phone: string;

  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({ example: 'INFLUENCER10' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  referralCode?: string;
}
