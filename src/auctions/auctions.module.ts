import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { AUCTION_CLOSE_QUEUE } from 'src/auctions/auction-queue.constants';
import { AuctionsController } from 'src/auctions/auctions.controller';
import { AuctionsProcessor } from 'src/auctions/auctions.processor';
import { AuctionsService } from 'src/auctions/auctions.service';
import { IdempotencyModule } from 'src/common/idempotency/idempotency.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { SalesModule } from 'src/sales/sales.module';
import { SocketsModule } from 'src/sockets/sockets.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: AUCTION_CLOSE_QUEUE }),
    AuditLogsModule,
    IdempotencyModule,
    SalesModule,
    SocketsModule,
    NotificationsModule,
  ],
  controllers: [AuctionsController],
  providers: [AuctionsService, AuctionsProcessor],
  exports: [AuctionsService],
})
export class AuctionsModule {}

