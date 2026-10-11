import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class PairingStatusDto {
  @ApiProperty({ description: 'Short-lived opaque secret from the TV pairing challenge' })
  @IsString()
  @Length(40, 64)
  code: string;
}
