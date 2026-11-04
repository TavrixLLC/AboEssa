import { Module } from '@nestjs/common';
import { OrdersController } from 'src/orders/orders.controller';
import { OrdersService } from 'src/orders/orders.service';
import { OrderActionsService } from 'src/orders/order-actions.service';
import { WalletModule } from 'src/wallet/wallet.module';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { SocketsModule } from 'src/sockets/sockets.module';

@Module({
  imports: [WalletModule, AuditLogsModule, SocketsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderActionsService],
  exports: [OrdersService, OrderActionsService],
})
export class OrdersModule {}
