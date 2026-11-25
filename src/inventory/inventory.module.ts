import { Module } from '@nestjs/common';
import { SocketsModule } from 'src/sockets/sockets.module';
import { InventoryController, InventoryEnabledGuard } from './inventory.controller';
import { InventoryService } from './inventory.service';
@Module({
  imports: [SocketsModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryEnabledGuard],
  exports: [InventoryService],
})
export class InventoryModule {}
