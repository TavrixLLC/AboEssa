import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class MarkLabelFailedDto {
  @ApiProperty({ example: 'Printer not connected' })
  @IsString()
  @MinLength(1)
  error: string;
}

