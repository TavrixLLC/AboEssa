import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { SalesSessionsController } from 'src/sales-sessions/sales-sessions.controller';
import { SalesSessionsService } from 'src/sales-sessions/sales-sessions.service';
import { SocketsModule } from 'src/sockets/sockets.module';

@Module({
  imports: [AuditLogsModule, SocketsModule],
  controllers: [SalesSessionsController],
  providers: [SalesSessionsService],
  exports: [SalesSessionsService],
})
export class SalesSessionsModule {}

