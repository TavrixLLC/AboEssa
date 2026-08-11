import { HttpStatus, Injectable } from '@nestjs/common';
import { ActorType, CustomerStatus, Prisma, ReferralStatus, VerificationStatus } from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { TokenService } from 'src/auth/token.service';
import { AppException } from 'src/common/exceptions/app.exception';
import { toSafeCustomer } from 'src/common/utils/safe-user.util';
import { OtpService } from 'src/customer-auth/otp/otp.service';
import { RequestOtpDto } from 'src/customer-auth/dto/request-otp.dto';
import { VerifyOtpDto } from 'src/customer-auth/dto/verify-otp.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async requestOtp(dto: RequestOtpDto, request: Request) {
    const result = await this.otpService.requestOtp(dto.phone);
    await this.auditLogs.create({
      actorType: ActorType.CUSTOMER,
      action: 'customer.otp_requested',
      entityType: 'Customer',
      metadata: { phone: result.phone },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return result;
  }

  async verifyOtp(dto: VerifyOtpDto, request: Request) {
    const phone = await this.otpService.verifyOtp(dto.phone, dto.otp);

    const customer = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({ where: { phone } });
      if (existing?.status === CustomerStatus.BLOCKED) {
        throw new AppException('Customer account is blocked', 'CUSTOMER_BLOCKED', HttpStatus.FORBIDDEN);
      }

      const baseData = {
        refreshTokenHash: null,
        lastLoginAt: new Date(),
      };

      let customerRecord;
      if (existing) {
        customerRecord = await tx.customer.update({
          where: { id: existing.id },
          data: {
            ...baseData,
            status: CustomerStatus.ACTIVE,
            isVirtual: false,
            displayName: existing.displayName || dto.displayName || this.defaultName(phone),
          },
        });
      } else {
        customerRecord = await tx.customer.create({
          data: {
            displayName: dto.displayName || this.defaultName(phone),
            phone,
            whatsappPhone: phone,
            status: CustomerStatus.ACTIVE,
            verificationStatus: VerificationStatus.UNVERIFIED,
            isVirtual: false,
            lastLoginAt: new Date(),
            notificationSettings: {
              create: {},
            },
            box: {
              create: {},
            },
          },
        });
      }

      if (dto.referralCode) {
        await this.applyReferralCode(tx, customerRecord.id, dto.referralCode);
        customerRecord = await tx.customer.findUniqueOrThrow({ where: { id: customerRecord.id } });
      }

      return customerRecord;
    });

    const refreshToken = this.tokenService.createRefreshToken(customer.id);
    const refreshTokenHash = await this.tokenService.hashRefreshToken(refreshToken);
    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: { refreshTokenHash },
    });

    await this.auditLogs.create({
      actorType: ActorType.CUSTOMER,
      actorId: updated.id,
      action: 'customer.otp_verified',
      entityType: 'Customer',
      entityId: updated.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return {
      accessToken: await this.tokenService.signCustomerAccess(updated),
      refreshToken,
      refreshExpiresAt: this.tokenService.getRefreshExpiryDate(),
      customer: toSafeCustomer(updated),
    };
  }

  async refresh(refreshToken: string, request: Request) {
    const customerId = this.tokenService.parseRefreshSubject(refreshToken);
    if (!customerId) {
      throw new AppException('Invalid refresh token', 'INVALID_REFRESH_TOKEN', HttpStatus.UNAUTHORIZED);
    }

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer?.refreshTokenHash || customer.status === CustomerStatus.BLOCKED) {
      throw new AppException('Invalid refresh token', 'INVALID_REFRESH_TOKEN', HttpStatus.UNAUTHORIZED);
    }

    const valid = await this.tokenService.verifyRefreshToken(customer.refreshTokenHash, refreshToken);
    if (!valid) {
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: { refreshTokenHash: null },
      });
      await this.auditLogs.create({
        actorType: ActorType.CUSTOMER,
        actorId: customer.id,
        action: 'customer.refresh_reuse_detected',
        entityType: 'Customer',
        entityId: customer.id,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      throw new AppException('Refresh token reuse detected', 'REFRESH_TOKEN_REUSE', HttpStatus.UNAUTHORIZED);
    }

    const nextRefreshToken = this.tokenService.createRefreshToken(customer.id);
    const nextRefreshTokenHash = await this.tokenService.hashRefreshToken(nextRefreshToken);
    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: { refreshTokenHash: nextRefreshTokenHash },
    });

    return {
      accessToken: await this.tokenService.signCustomerAccess(updated),
      refreshToken: nextRefreshToken,
      refreshExpiresAt: this.tokenService.getRefreshExpiryDate(),
      customer: toSafeCustomer(updated),
    };
  }

  async logout(customerId: string, request: Request) {
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { refreshTokenHash: null },
    });

    await this.auditLogs.create({
      actorType: ActorType.CUSTOMER,
      actorId: customerId,
      action: 'customer.logout',
      entityType: 'Customer',
      entityId: customerId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return { loggedOut: true };
  }

  async me(customerId: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    return toSafeCustomer(customer);
  }

  private defaultName(phone: string) {
    return `Customer ${phone.slice(-4)}`;
  }

  private async applyReferralCode(
    tx: Prisma.TransactionClient,
    customerId: string,
    rawCode: string,
  ) {
    const existingAttribution = await tx.referralAttribution.findUnique({ where: { customerId } });
    if (existingAttribution) {
      return;
    }

    const now = new Date();
    const code = await tx.referralCode.findUnique({
      where: { code: rawCode.trim().toUpperCase() },
      include: { influencer: true },
    });

    if (
      !code ||
      !code.isActive ||
      !code.influencer.isActive ||
      (code.startsAt && code.startsAt > now) ||
      (code.endsAt && code.endsAt < now)
    ) {
      throw new AppException('Referral code is invalid or expired', 'INVALID_REFERRAL_CODE', HttpStatus.BAD_REQUEST);
    }

    const expiresAt = new Date(now.getTime() + code.durationDays * 24 * 60 * 60 * 1000);
    await tx.referralAttribution.create({
      data: {
        customerId,
        influencerId: code.influencerId,
        referralCodeId: code.id,
        startsAt: now,
        expiresAt,
        status: ReferralStatus.ACTIVE,
      },
    });

    await tx.customer.update({
      where: { id: customerId },
      data: {
        referralCodeUsed: code.code,
        referredByInfluencerId: code.influencerId,
        referralExpiresAt: expiresAt,
      },
    });
  }
}

