import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { IdempotencyModule } from 'src/common/idempotency/idempotency.module';
import { LabelsModule } from 'src/labels/labels.module';
import { WarehouseController } from 'src/warehouse/warehouse.controller';
import { WarehouseService } from 'src/warehouse/warehouse.service';

@Module({
  imports: [AuditLogsModule, IdempotencyModule, LabelsModule],
  controllers: [WarehouseController],
  providers: [WarehouseService],
  exports: [WarehouseService],
})
export class WarehouseModule {}

