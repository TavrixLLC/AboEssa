import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AuthRefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  refreshToken: string;
}

