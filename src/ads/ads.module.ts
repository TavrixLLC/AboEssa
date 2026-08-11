import { Module } from '@nestjs/common';
import { AdsController } from 'src/ads/ads.controller';
import { AdsService } from 'src/ads/ads.service';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';

@Module({
  imports: [AuditLogsModule],
  controllers: [AdsController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule {}
