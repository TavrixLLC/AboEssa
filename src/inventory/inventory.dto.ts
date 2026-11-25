import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class InventoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @Length(0, 100) search?: string;
  @IsOptional() @IsString() @Length(1, 80) warehouseId?: string;
  @IsOptional() @IsString() @Length(1, 80) locationId?: string;
  @IsOptional() @IsIn(['true', 'false']) activeOnly?: string;
  @IsOptional() @IsIn(['true', 'false']) physicalOnly?: string;
  @IsOptional()
  @IsIn([
    'OPENING_BALANCE',
    'STOCK_IN',
    'RESERVATION',
    'SALE',
    'SALE_REVERSAL',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
  ])
  movementType?: string;
}
export class WarehouseWriteDto {
  @IsOptional() @IsString() @Length(1, 40) code?: string;
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class LocationWriteDto extends WarehouseWriteDto {
  @IsOptional() @IsString() @Length(1, 80) warehouseId?: string;
  @IsOptional() @IsString() @Length(1, 80) parentId?: string | null;
  @IsOptional() @IsIn(['ZONE', 'SHELF', 'BIN', 'STANDARD']) type?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number;
}
export class StockInDto {
  @IsString() @Length(1, 80) locationId: string;
  @IsInt() @Min(1) @Max(1000000) quantity: number;
  @IsOptional() @IsString() @Length(0, 120) reference?: string;
  @IsOptional() @IsString() @Length(0, 500) notes?: string;
}
export class AdjustStockDto {
  @IsString() @Length(1, 80) locationId: string;
  @IsInt() @Min(-1000000) @Max(1000000) quantityDelta: number;
  @IsString() @Length(3, 500) reason: string;
  @IsOptional() @IsString() @Length(0, 120) reference?: string;
  @IsOptional() @IsString() @Length(0, 500) notes?: string;
}
export class TransferStockDto {
  @IsString() @Length(1, 80) productId: string;
  @IsString() @Length(1, 80) sourceLocationId: string;
  @IsString() @Length(1, 80) destinationLocationId: string;
  @IsInt() @Min(1) @Max(1000000) quantity: number;
  @IsOptional() @IsString() @Length(0, 120) reference?: string;
  @IsOptional() @IsString() @Length(0, 500) notes?: string;
}
export class InventoryBackfillDto {
  @IsOptional() @IsBoolean() dryRun = true;
  @IsOptional() @IsString() @Length(1, 80) productId?: string;
  @IsOptional() @IsString() @Length(1, 80) afterId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(50) limit = 20;
}
