import { Module } from '@nestjs/common';
import { MarketplaceController } from 'src/marketplace/marketplace.controller';
import { MarketplaceService } from 'src/marketplace/marketplace.service';

@Module({
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
})
export class MarketplaceModule {}
