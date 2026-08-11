import { PrintJobStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

export class LabelJobQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PrintJobStatus })
  @IsOptional()
  @IsEnum(PrintJobStatus)
  status?: PrintJobStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

