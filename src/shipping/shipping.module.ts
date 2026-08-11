import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { IdempotencyModule } from 'src/common/idempotency/idempotency.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ShippingController } from 'src/shipping/shipping.controller';
import { ShippingService } from 'src/shipping/shipping.service';
import { SocketsModule } from 'src/sockets/sockets.module';

@Module({
  imports: [AuditLogsModule, IdempotencyModule, NotificationsModule, SocketsModule],
  controllers: [ShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}

