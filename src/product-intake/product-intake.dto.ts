import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
  Matches,
} from 'class-validator';

export class IntakeCreateDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) clientDraftId: string;
  @IsString() @Length(8, 100) submissionOperationKey: string;
}
export class IntakeMetadataDto {
  @IsOptional() @IsString() @Length(0, 200) title?: string;
  @IsOptional() @IsString() @Length(0, 4000) description?: string;
  @IsOptional() @IsString() @Length(1, 80) categoryId?: string | null;
  @IsOptional() @IsString() @Matches(/^\d{1,10}(\.\d{1,2})?$/) price?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(99) discountPercentage?: number | null;
}
export class IntakeRevisionDto {
  @IsInt() @Min(0) expectedRevision: number;
}
export class IntakePatchDto extends IntakeRevisionDto {
  @IsOptional() @IsIn(['NEW', 'STOCK_IN']) mode?: 'NEW' | 'STOCK_IN';
  @IsOptional()
  @ValidateNested()
  @Type(() => IntakeMetadataDto)
  approvedMetadata?: IntakeMetadataDto;
  @IsOptional() @IsInt() @Min(1) @Max(1000000) quantity?: number | null;
  @IsOptional() @IsString() @Length(1, 80) locationId?: string | null;
  @IsOptional() @IsString() @Length(1, 80) existingProductId?: string | null;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) selectedImageKey?: string | null;
}
export class IntakeImageDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) clientImageId: string;
}
export class IntakeListDto {
  @IsOptional() @IsIn(['true', 'false']) allEmployees?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) limit = 20;
  @IsOptional() @IsIn(['DRAFT', 'COMPLETED', 'CANCELLED']) status?:
    'DRAFT' | 'COMPLETED' | 'CANCELLED';
}
