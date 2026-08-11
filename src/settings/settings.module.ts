import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { SettingsController } from 'src/settings/settings.controller';
import { SettingsService } from 'src/settings/settings.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

