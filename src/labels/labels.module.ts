import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { LabelsController } from 'src/labels/labels.controller';
import { LabelsService } from 'src/labels/labels.service';
import { SocketsModule } from 'src/sockets/sockets.module';

@Module({
  imports: [AuditLogsModule, SocketsModule],
  controllers: [LabelsController],
  providers: [LabelsService],
  exports: [LabelsService],
})
export class LabelsModule {}

