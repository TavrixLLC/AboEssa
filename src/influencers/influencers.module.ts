import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { InfluencersController } from 'src/influencers/influencers.controller';
import { InfluencersService } from 'src/influencers/influencers.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [InfluencersController],
  providers: [InfluencersService],
  exports: [InfluencersService],
})
export class InfluencersModule {}

