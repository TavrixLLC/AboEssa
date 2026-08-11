import { AdminRole } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateAdminUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ enum: AdminRole })
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

