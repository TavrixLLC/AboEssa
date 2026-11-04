import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

export class ConsoleOrdersQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional()
  @IsIn(['NEW', 'PREPARING', 'READY', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
  state?: string;
}

export class ConsoleOrderActionDto {
  @IsIn(['PREPARE', 'READY', 'SHIP', 'DELIVER', 'CANCEL']) action: string;
  @IsOptional() @IsString() @MaxLength(160) shippingCompany?: string;
  @IsOptional() @IsString() @MaxLength(160) trackingNumber?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shippingPrice?: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
