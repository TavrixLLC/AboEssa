import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class PlaceBidDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;
}

