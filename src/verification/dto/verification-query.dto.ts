import { VerificationStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

export class VerificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: VerificationStatus })
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;
}

