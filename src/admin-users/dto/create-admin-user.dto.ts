import { AdminRole } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateAdminUserDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: AdminRole })
  @IsEnum(AdminRole)
  role: AdminRole;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

