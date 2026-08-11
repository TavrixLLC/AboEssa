import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateScreenDto {
  @ApiProperty({ example: 'Main TV' })
  @IsString()
  @MinLength(1)
  name: string;
}

