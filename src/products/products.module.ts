import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { CheckoutModule } from 'src/checkout/checkout.module';
import { IdempotencyModule } from 'src/common/idempotency/idempotency.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ProductsController } from 'src/products/products.controller';
import { ProductsService } from 'src/products/products.service';
import { SalesModule } from 'src/sales/sales.module';
import { SocketsModule } from 'src/sockets/sockets.module';
import { WalletModule } from 'src/wallet/wallet.module';

@Module({
  imports: [
    AuditLogsModule,
    CheckoutModule,
    IdempotencyModule,
    SalesModule,
    SocketsModule,
    NotificationsModule,
    WalletModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
