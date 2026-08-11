import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RenameScreenDto {
  @ApiProperty({ example: 'Warehouse TV' })
  @IsString()
  @MinLength(1)
  name: string;
}

