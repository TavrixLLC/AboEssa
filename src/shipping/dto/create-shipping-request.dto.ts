import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsOptional, IsString } from 'class-validator';

export class CreateShippingRequestDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  itemIds: string[];

  @ApiProperty()
  @IsString()
  addressId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
