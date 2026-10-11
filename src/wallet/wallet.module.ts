import { Module } from '@nestjs/common';
import { WalletController } from 'src/wallet/wallet.controller';
import { WalletService } from 'src/wallet/wallet.service';

@Module({
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
