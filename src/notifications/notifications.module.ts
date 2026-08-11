import { Module } from '@nestjs/common';
import { NotificationsController } from 'src/notifications/notifications.controller';
import { NotificationsService } from 'src/notifications/notifications.service';
import { SocketsModule } from 'src/sockets/sockets.module';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { IdempotencyModule } from 'src/common/idempotency/idempotency.module';
import { AdminNotificationsController } from 'src/notifications/admin-notifications.controller';
import { AdminNotificationsService } from 'src/notifications/admin-notifications.service';

@Module({
  imports: [AuditLogsModule, IdempotencyModule, SocketsModule],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [NotificationsService, AdminNotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
