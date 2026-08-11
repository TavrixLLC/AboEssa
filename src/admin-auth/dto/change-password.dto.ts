import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ writeOnly: true, minLength: 8 }) @IsString() @MinLength(8) @MaxLength(128) currentPassword: string;
  @ApiProperty({ writeOnly: true, minLength: 10 }) @IsString() @MinLength(10) @MaxLength(128) newPassword: string;
}
