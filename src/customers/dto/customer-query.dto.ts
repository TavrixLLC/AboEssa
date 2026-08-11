import { CustomerStatus, VerificationStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

export class CustomerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CustomerStatus })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({ enum: VerificationStatus })
  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isVirtual?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}

