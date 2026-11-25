import { Module } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { AuthModule } from 'src/auth/auth.module';
import { AdminAuthController } from 'src/admin-auth/admin-auth.controller';
import { AdminAuthService } from 'src/admin-auth/admin-auth.service';
import { AdminUsersModule } from 'src/admin-users/admin-users.module';

@Module({
  imports: [AuthModule, AuditLogsModule, AdminUsersModule],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, ThrottlerGuard],
})
export class AdminAuthModule {}
