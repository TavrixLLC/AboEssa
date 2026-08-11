import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpProvider } from 'src/customer-auth/otp/otp-provider.interface';

@Injectable()
export class MockWhatsAppOtpProvider implements OtpProvider {
  private readonly logger = new Logger(MockWhatsAppOtpProvider.name);

  constructor(private readonly config: ConfigService) {}

  sendOtp(phone: string, otp: string): Promise<void> {
    if (this.config.get<string>('app.nodeEnv') !== 'production') {
      this.logger.log(`Development WhatsApp OTP for ${phone}: ${otp}`);
    }
    return Promise.resolve();
  }
}
