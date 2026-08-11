import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ example: '+9647700000000' })
  @IsString()
  @MinLength(8)
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  otp: string;

  @ApiPropertyOptional({ example: 'Ahmed' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ example: 'INFLUENCER10' })
  @IsOptional()
  @IsString()
  referralCode?: string;
}

