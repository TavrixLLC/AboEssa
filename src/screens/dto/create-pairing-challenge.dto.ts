import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreatePairingChallengeDto {
  @ApiProperty({ example: '9db34b3c-76d7-4e87-88a9-65273c473070' })
  @IsUUID()
  installationId: string;
}
