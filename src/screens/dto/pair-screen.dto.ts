import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class PairScreenDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  challengeId: string;

  @ApiProperty({ description: 'Short-lived opaque secret scanned from the TV' })
  @IsString()
  @Length(40, 64)
  code: string;

  @ApiPropertyOptional({ example: 'Main Store TV' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;
}
