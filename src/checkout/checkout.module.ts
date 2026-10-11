import { Module } from '@nestjs/common';
import { CheckoutService } from 'src/checkout/checkout.service';
import { WalletModule } from 'src/wallet/wallet.module';

@Module({
  imports: [WalletModule],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
