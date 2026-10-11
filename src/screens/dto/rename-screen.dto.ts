import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RenameScreenDto {
  @ApiProperty({ example: 'Warehouse TV' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}
