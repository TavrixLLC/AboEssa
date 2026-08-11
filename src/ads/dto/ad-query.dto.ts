import { AdPlacement } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';
import { CURRENT_AD_PLACEMENTS } from 'src/ads/ads.constants';

export class AdQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CURRENT_AD_PLACEMENTS })
  @IsOptional()
  @IsIn(CURRENT_AD_PLACEMENTS)
  placement?: AdPlacement;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;
}
