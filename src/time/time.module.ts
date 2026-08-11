import { Module } from '@nestjs/common';
import { TimeController } from 'src/time/time.controller';

@Module({
  controllers: [TimeController],
})
export class TimeModule {}

