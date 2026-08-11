import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { IdempotencyModule } from 'src/common/idempotency/idempotency.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ProductsController } from 'src/products/products.controller';
import { ProductsService } from 'src/products/products.service';
import { SalesModule } from 'src/sales/sales.module';
import { SocketsModule } from 'src/sockets/sockets.module';

@Module({
  imports: [AuditLogsModule, IdempotencyModule, SalesModule, SocketsModule, NotificationsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}

