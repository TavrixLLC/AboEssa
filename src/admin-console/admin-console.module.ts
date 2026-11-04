import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { SocketsModule } from 'src/sockets/sockets.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { AdminConsoleController } from './admin-console.controller';
import { AdminConsoleService } from './admin-console.service';

@Module({
  imports: [WalletModule, AuditLogsModule, SocketsModule, NotificationsModule],
  controllers: [AdminConsoleController],
  providers: [AdminConsoleService],
})
export class AdminConsoleModule {}
