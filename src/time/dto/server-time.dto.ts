import { ApiProperty } from '@nestjs/swagger';

export class ServerTimeDto {
  @ApiProperty({ example: '2026-07-13T12:00:00.000Z' })
  serverTime: string;
}

