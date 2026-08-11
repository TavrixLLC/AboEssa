import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: '+9647700000000' })
  @IsString()
  @MinLength(8)
  phone: string;
}

