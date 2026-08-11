import { AdminRole } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

export class AdminUserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AdminRole })
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

