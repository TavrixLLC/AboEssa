import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { CheckoutDto } from 'src/checkout/dto/checkout.dto';

export class BuyProductDto extends CheckoutDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  quantity?: number;
}
