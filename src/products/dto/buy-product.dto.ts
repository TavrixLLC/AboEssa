import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional } from 'class-validator';

export class BuyProductDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  quantity?: number;
}
