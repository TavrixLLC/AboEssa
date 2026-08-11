import { Module } from '@nestjs/common';
import { AuditLogsModule } from 'src/audit-logs/audit-logs.module';
import { AuthModule } from 'src/auth/auth.module';
import { CustomerAuthController } from 'src/customer-auth/customer-auth.controller';
import { CustomerAuthService } from 'src/customer-auth/customer-auth.service';
import { MockWhatsAppOtpProvider } from 'src/customer-auth/otp/mock-whatsapp-otp.provider';
import { OTP_PROVIDER } from 'src/customer-auth/otp/otp-provider.interface';
import { OtpService } from 'src/customer-auth/otp/otp.service';

@Module({
  imports: [AuthModule, AuditLogsModule],
  controllers: [CustomerAuthController],
  providers: [
    CustomerAuthService,
    OtpService,
    MockWhatsAppOtpProvider,
    {
      provide: OTP_PROVIDER,
      useExisting: MockWhatsAppOtpProvider,
    },
  ],
  exports: [CustomerAuthService, OtpService],
})
export class CustomerAuthModule {}

