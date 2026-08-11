import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class ReadBatchNotificationsDto {
  @ApiProperty({ type: [String], example: ['notification-1', 'notification-2'] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids: string[];
}
