import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

export class CategoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

