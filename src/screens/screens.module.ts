import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { AuthModule } from 'src/auth/auth.module';
import { ScreensController } from 'src/screens/screens.controller';
import { ScreensService } from 'src/screens/screens.service';

@Module({
  imports: [AuditLogsModule, AuthModule],
  controllers: [ScreensController],
  providers: [ScreensService],
  exports: [ScreensService],
})
export class ScreensModule {}

