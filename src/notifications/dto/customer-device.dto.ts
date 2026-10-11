import { DevicePlatform } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterCustomerDeviceDto {
  @ApiProperty({ minLength: 16, maxLength: 128 })
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  installationId: string;

  @ApiProperty({ enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @ApiProperty({ writeOnly: true, minLength: 16, maxLength: 4096 })
  @IsString()
  @MinLength(16)
  @MaxLength(4096)
  token: string;

  @ApiProperty({ enum: ['ar', 'en'] })
  @IsIn(['ar', 'en'])
  preferredLocale: 'ar' | 'en';
}

export class CustomerDeviceResponseDto {
  @ApiProperty()
  installationId: string;

  @ApiProperty({ enum: DevicePlatform })
  platform: DevicePlatform;

  @ApiProperty({ enum: ['ar', 'en'] })
  preferredLocale: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  updatedAt: Date;
}
