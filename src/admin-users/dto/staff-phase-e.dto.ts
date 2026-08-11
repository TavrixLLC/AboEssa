import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/pagination.dto';

export class StaffQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'warehouse' }) @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'LOCKED'] }) @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'LOCKED']) status?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() roleId?: string;
  @ApiPropertyOptional({ enum: ['displayName', 'email', 'createdAt', 'lastLoginAt'] }) @IsOptional() @IsIn(['displayName', 'email', 'createdAt', 'lastLoginAt']) sortBy?: string;
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' }) @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
}

export class CreateStaffDto {
  @ApiProperty({ example: 'staff@example.com' }) @IsEmail() email: string;
  @ApiProperty({ example: 'Staff Name' }) @IsString() @MinLength(1) @MaxLength(120) displayName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) jobTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @ApiProperty({ minLength: 10, writeOnly: true }) @IsString() @MinLength(10) @MaxLength(128) temporaryPassword: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) roleIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) directGrantKeys?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) directDenyKeys?: string[];
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() mustChangePassword?: boolean;
}

export class UpdateStaffProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(120) displayName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) jobTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class StaffAccessDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) roleIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) directGrantKeys?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) directDenyKeys?: string[];
}

export class ResetStaffPasswordDto {
  @ApiProperty({ minLength: 10, writeOnly: true }) @IsString() @MinLength(10) @MaxLength(128) newTemporaryPassword: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() mustChangePassword?: boolean;
}

export class CreateRoleDto {
  @ApiProperty({ example: 'Warehouse Manager' }) @IsString() @MinLength(1) @MaxLength(120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) permissionKeys?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) permissionKeys?: string[];
}

export class AccessPreviewDto extends StaffAccessDto {}

export class SessionQueryDto extends PaginationQueryDto {}
