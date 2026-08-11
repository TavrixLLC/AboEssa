import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReviewCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

