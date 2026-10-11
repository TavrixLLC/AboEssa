import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { AuthModule } from 'src/auth/auth.module';
import { CustomerAuthController } from 'src/customer-auth/customer-auth.controller';
import { CustomerAuthService } from 'src/customer-auth/customer-auth.service';

@Module({
  imports: [AuthModule, AuditLogsModule],
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService],
  exports: [CustomerAuthService],
})
export class CustomerAuthModule {}
