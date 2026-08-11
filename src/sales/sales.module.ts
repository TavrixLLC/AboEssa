import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { IdempotencyModule } from 'src/common/idempotency/idempotency.module';
import { LabelsModule } from 'src/labels/labels.module';
import { SalesController } from 'src/sales/sales.controller';
import { SalesService } from 'src/sales/sales.service';
import { SocketsModule } from 'src/sockets/sockets.module';

@Module({
  imports: [AuditLogsModule, IdempotencyModule, LabelsModule, SocketsModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}

