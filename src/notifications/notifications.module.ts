import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsController } from 'src/notifications/notifications.controller';
import { NotificationsService } from 'src/notifications/notifications.service';
import { SocketsModule } from 'src/sockets/sockets.module';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { IdempotencyModule } from 'src/common/idempotency/idempotency.module';
import { AdminNotificationsController } from 'src/notifications/admin-notifications.controller';
import { AdminNotificationsService } from 'src/notifications/admin-notifications.service';
import { CustomerDevicesController } from 'src/notifications/customer-devices.controller';
import { CustomerDevicesService } from 'src/notifications/customer-devices.service';
import { FirebasePushProvider } from 'src/notifications/firebase-push.provider';
import { NoopPushProvider } from 'src/notifications/noop-push.provider';
import { PUSH_DELIVERY_QUEUE } from 'src/notifications/push-delivery.constants';
import { PushDeliveryProcessor } from 'src/notifications/push-delivery.processor';
import { PushDeliveryService } from 'src/notifications/push-delivery.service';
import { PUSH_PROVIDER } from 'src/notifications/push-provider.interface';

@Module({
  imports: [
    AuditLogsModule,
    IdempotencyModule,
    SocketsModule,
    BullModule.registerQueue({ name: PUSH_DELIVERY_QUEUE }),
  ],
  controllers: [
    NotificationsController,
    AdminNotificationsController,
    CustomerDevicesController,
  ],
  providers: [
    NotificationsService,
    AdminNotificationsService,
    CustomerDevicesService,
    PushDeliveryService,
    PushDeliveryProcessor,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (config.get<string>('push.provider') !== 'firebase') return new NoopPushProvider();
        return new FirebasePushProvider(
          config.getOrThrow<string>('push.firebaseServiceAccountFile'),
          config.get<string>('push.firebaseProjectId'),
        );
      },
    },
  ],
  exports: [NotificationsService, CustomerDevicesService, PushDeliveryService],
})
export class NotificationsModule {}
