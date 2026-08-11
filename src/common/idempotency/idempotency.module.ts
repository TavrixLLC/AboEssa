import { Module } from '@nestjs/common';
import { IdempotencyService } from 'src/common/idempotency/idempotency.service';

@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}

