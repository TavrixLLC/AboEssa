import { ApiProperty } from '@nestjs/swagger';

export class SuccessEnvelopeDto<T = unknown> {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty()
  data: T;
}

export class ErrorEnvelopeDto {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty({ example: 'Human-readable message' })
  error: string;

  @ApiProperty({ example: 'ERROR_CODE' })
  code: string;

  @ApiProperty({ example: '018fdc57-dfd0-7d32-8a30-a1c315cc41a3' })
  requestId: string;
}

