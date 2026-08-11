import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateReferralCodeDto {
  @ApiProperty()
  @IsString()
  influencerId: string;

  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  durationDays: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
