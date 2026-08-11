import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppException } from 'src/common/exceptions/app.exception';
import { PasswordService } from 'src/common/security/password.service';
import { normalizePhone } from 'src/common/utils/phone.util';
import { OTP_PROVIDER, OtpProvider } from 'src/customer-auth/otp/otp-provider.interface';

type OtpRecord = {
  otpHash: string;
  attempts: number;
  lastSentAt: string;
  expiresAt: string;
};

@Injectable()
export class OtpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OtpService.name);
  private readonly memoryStore = new Map<string, OtpRecord>();
  private redis?: Redis;

  constructor(
    private readonly config: ConfigService,
    private readonly passwordService: PasswordService,
    @Inject(OTP_PROVIDER) private readonly provider: OtpProvider,
  ) {}

  async onModuleInit() {
    const redisUrl = this.config.get<string>('redis.url');
    if (!redisUrl) {
      return;
    }

    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });

    try {
      await this.redis.connect();
    } catch (error) {
      this.logger.warn(`Redis unavailable for OTP store, falling back to memory: ${(error as Error).message}`);
      this.redis = undefined;
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }

  async requestOtp(rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    if (phone.length < 8) {
      throw new AppException('Invalid phone number', 'INVALID_PHONE', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.getRecord(phone);
    const cooldownSeconds = this.config.get<number>('otp.cooldownSeconds') ?? 60;
    if (existing) {
      const lastSentAt = new Date(existing.lastSentAt).getTime();
      const waitMs = cooldownSeconds * 1000 - (Date.now() - lastSentAt);
      if (waitMs > 0) {
        throw new AppException(
          `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another OTP`,
          'OTP_COOLDOWN',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const otp = this.generateOtp();
    const ttlSeconds = this.config.get<number>('otp.ttlSeconds') ?? 300;
    const record: OtpRecord = {
      otpHash: await this.passwordService.hash(otp),
      attempts: 0,
      lastSentAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };

    await this.setRecord(phone, record, ttlSeconds);
    await this.provider.sendOtp(phone, otp);

    return {
      phone,
      expiresInSeconds: ttlSeconds,
      cooldownSeconds,
    };
  }

  async verifyOtp(rawPhone: string, otp: string) {
    const phone = normalizePhone(rawPhone);
    const record = await this.getRecord(phone);
    if (!record || new Date(record.expiresAt).getTime() < Date.now()) {
      await this.deleteRecord(phone);
      throw new AppException('OTP has expired', 'OTP_EXPIRED', HttpStatus.BAD_REQUEST);
    }

    const maxAttempts = this.config.get<number>('otp.maxAttempts') ?? 5;
    if (record.attempts >= maxAttempts) {
      await this.deleteRecord(phone);
      throw new AppException('Too many OTP attempts', 'OTP_MAX_ATTEMPTS', HttpStatus.TOO_MANY_REQUESTS);
    }

    const valid = await this.passwordService.verify(record.otpHash, otp);
    if (!valid) {
      record.attempts += 1;
      const ttlSeconds = Math.max(1, Math.ceil((new Date(record.expiresAt).getTime() - Date.now()) / 1000));
      await this.setRecord(phone, record, ttlSeconds);
      throw new AppException('Invalid OTP', 'INVALID_OTP', HttpStatus.BAD_REQUEST);
    }

    await this.deleteRecord(phone);
    return phone;
  }

  private generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private otpKey(phone: string) {
    return `otp:${phone}`;
  }

  private async getRecord(phone: string): Promise<OtpRecord | undefined> {
    if (this.redis?.status === 'ready') {
      const value = await this.redis.get(this.otpKey(phone));
      return value ? (JSON.parse(value) as OtpRecord) : undefined;
    }

    return this.memoryStore.get(phone);
  }

  private async setRecord(phone: string, record: OtpRecord, ttlSeconds: number) {
    if (this.redis?.status === 'ready') {
      await this.redis.set(this.otpKey(phone), JSON.stringify(record), 'EX', ttlSeconds);
      return;
    }

    this.memoryStore.set(phone, record);
  }

  private async deleteRecord(phone: string) {
    if (this.redis?.status === 'ready') {
      await this.redis.del(this.otpKey(phone));
      return;
    }

    this.memoryStore.delete(phone);
  }
}

