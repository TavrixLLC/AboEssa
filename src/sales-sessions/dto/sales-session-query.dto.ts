import { LiveSessionSource, LiveSessionStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

export class SalesSessionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LiveSessionStatus })
  @IsOptional()
  @IsEnum(LiveSessionStatus)
  status?: LiveSessionStatus;

  @ApiPropertyOptional({ enum: [LiveSessionSource.TIKTOK_EXTERNAL, LiveSessionSource.MANUAL] })
  @IsOptional()
  @IsIn([LiveSessionSource.TIKTOK_EXTERNAL, LiveSessionSource.MANUAL])
  source?: LiveSessionSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}
