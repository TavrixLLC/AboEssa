import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActorType,
  CustomerStatus,
  Prisma,
  ReferralStatus,
  VerificationStatus,
} from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { TokenService } from 'src/auth/token.service';
import { AppException } from 'src/common/exceptions/app.exception';
import { assertPasswordPolicy } from 'src/common/security/password-policy';
import { PasswordService } from 'src/common/security/password.service';
import { normalizePhone } from 'src/common/utils/phone.util';
import { toSafeCustomer } from 'src/common/utils/safe-user.util';
import { CustomerLoginDto } from 'src/customer-auth/dto/customer-login.dto';
import { CustomerRegisterDto } from 'src/customer-auth/dto/customer-register.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async register(dto: CustomerRegisterDto, request: Request) {
    const phone = this.validPhone(dto.phone);
    const displayName = dto.displayName.trim();
    assertPasswordPolicy(dto.password);

    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    if (existing) {
      throw new AppException(
        'A customer account already uses this phone number',
        'CUSTOMER_PHONE_ALREADY_REGISTERED',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const customer = await this.prisma.$transaction(async (tx) => {
      let created = await tx.customer.create({
        data: {
          displayName,
          phone,
          whatsappPhone: phone,
          passwordHash,
          status: CustomerStatus.ACTIVE,
          verificationStatus: VerificationStatus.UNVERIFIED,
          isVirtual: false,
          lastLoginAt: new Date(),
          notificationSettings: { create: {} },
          box: { create: {} },
        },
      });

      if (dto.referralCode?.trim()) {
        await this.applyReferralCode(tx, created.id, dto.referralCode);
        created = await tx.customer.findUniqueOrThrow({ where: { id: created.id } });
      }
      return created;
    });

    await this.auditLogs.create({
      actorType: ActorType.CUSTOMER,
      actorId: customer.id,
      action: 'customer.registered',
      entityType: 'Customer',
      entityId: customer.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return this.createSession(customer.id);
  }

  async login(dto: CustomerLoginDto, request: Request) {
    const phone = this.validPhone(dto.phone);
    const customer = await this.prisma.customer.findUnique({ where: { phone } });
    const valid = customer?.passwordHash
      ? await this.passwordService.verify(customer.passwordHash, dto.password)
      : false;

    if (!customer || !valid || customer.status === CustomerStatus.BLOCKED || customer.deletedAt) {
      await this.auditLogs.create({
        actorType: ActorType.CUSTOMER,
        actorId: customer?.id,
        action: 'customer.login_failed',
        entityType: 'Customer',
        entityId: customer?.id,
        metadata: { phone },
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      throw new AppException(
        'Invalid phone or password',
        'INVALID_CREDENTIALS',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { lastLoginAt: new Date(), refreshTokenHash: null },
    });
    await this.auditLogs.create({
      actorType: ActorType.CUSTOMER,
      actorId: customer.id,
      action: 'customer.login_success',
      entityType: 'Customer',
      entityId: customer.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return this.createSession(customer.id);
  }

  async refresh(refreshToken: string, request: Request) {
    const customerId = this.tokenService.parseRefreshSubject(refreshToken);
    if (!customerId) {
      throw new AppException(
        'Invalid refresh token',
        'INVALID_REFRESH_TOKEN',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer?.refreshTokenHash || customer.status === CustomerStatus.BLOCKED || customer.deletedAt) {
      throw new AppException(
        'Invalid refresh token',
        'INVALID_REFRESH_TOKEN',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const valid = await this.tokenService.verifyRefreshToken(
      customer.refreshTokenHash,
      refreshToken,
    );
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
      throw new AppException(
        'Refresh token reuse detected',
        'REFRESH_TOKEN_REUSE',
        HttpStatus.UNAUTHORIZED,
      );
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
    const installationHeader = request.headers['x-installation-id'];
    const installationId = Array.isArray(installationHeader)
      ? installationHeader[0]
      : installationHeader;
    if (installationId && installationId.length >= 16 && installationId.length <= 128) {
      await this.prisma.customerDevice.deleteMany({ where: { customerId, installationId } });
    }
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
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.deletedAt) {
      throw new AppException(
        'Customer account is unavailable',
        'CUSTOMER_ACCOUNT_UNAVAILABLE',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return toSafeCustomer(customer);
  }

  async deleteAccount(customerId: string, password: string, request: Request) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    await this.assertDeletionCredentials(customer, password);
    return this.eraseCustomerAccount(customerId, request);
  }

  async deleteAccountFromWeb(rawPhone: string, password: string, request: Request) {
    const phone = this.validPhone(rawPhone);
    const customer = await this.prisma.customer.findUnique({ where: { phone } });
    await this.assertDeletionCredentials(customer, password);
    return this.eraseCustomerAccount(customer!.id, request);
  }

  private async assertDeletionCredentials(
    customer: { passwordHash: string | null; deletedAt: Date | null } | null,
    password: string,
  ) {
    const valid = customer?.passwordHash
      ? await this.passwordService.verify(customer.passwordHash, password)
      : false;
    if (!customer || customer.deletedAt || !valid) {
      throw new AppException(
        'Invalid phone or password',
        'INVALID_CREDENTIALS',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private async eraseCustomerAccount(customerId: string, request: Request) {
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.notification.deleteMany({ where: { customerId } });
      await tx.customerDevice.deleteMany({ where: { customerId } });
      await tx.customerNotificationSettings.deleteMany({ where: { customerId } });
      await tx.verificationRequest.deleteMany({ where: { customerId } });
      await tx.customerAddress.deleteMany({ where: { customerId } });
      await tx.customerBox.deleteMany({ where: { customerId } });
      await tx.referralAttribution.deleteMany({ where: { customerId } });
      await tx.fileAsset.deleteMany({ where: { uploadedByCustomerId: customerId } });
      await tx.idempotencyKey.deleteMany({
        where: { actorType: ActorType.CUSTOMER, actorId: customerId },
      });
      await tx.auditLog.deleteMany({
        where: { actorType: ActorType.CUSTOMER, actorId: customerId },
      });
      await tx.bid.updateMany({
        where: { customerId },
        data: { ipHash: null, userAgentHash: null },
      });
      await tx.shipmentRequest.updateMany({
        where: { customerId },
        data: { addressSnapshot: Prisma.DbNull, customerNote: null },
      });
      await tx.customer.update({
        where: { id: customerId },
        data: {
          displayName: 'Deleted customer',
          phone: null,
          whatsappPhone: null,
          tiktokUsername: null,
          status: CustomerStatus.BLOCKED,
          verificationStatus: VerificationStatus.UNVERIFIED,
          isVirtual: false,
          purchaseLimitOverride: null,
          trustLevel: null,
          notes: null,
          referralCodeUsed: null,
          referredByInfluencerId: null,
          referralExpiresAt: null,
          passwordHash: null,
          refreshTokenHash: null,
          lastLoginAt: null,
          deletedAt,
        },
      });
    });

    await this.auditLogs.create({
      actorType: ActorType.SYSTEM,
      action: 'customer.account_deleted',
      entityType: 'Customer',
      summary: 'Customer account personal data erased',
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return {
      deleted: true,
      deletedAt,
      retainedData: 'Anonymized transaction records required for accounting, security, and fraud prevention',
    };
  }

  private validPhone(rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    if (phone.length < 8) {
      throw new AppException('Invalid phone number', 'INVALID_PHONE', HttpStatus.BAD_REQUEST);
    }
    return phone;
  }

  private async createSession(customerId: string) {
    const refreshToken = this.tokenService.createRefreshToken(customerId);
    const refreshTokenHash = await this.tokenService.hashRefreshToken(refreshToken);
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: { refreshTokenHash },
    });
    return {
      accessToken: await this.tokenService.signCustomerAccess(customer),
      refreshToken,
      refreshExpiresAt: this.tokenService.getRefreshExpiryDate(),
      customer: toSafeCustomer(customer),
    };
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
      throw new AppException(
        'Referral code is invalid or expired',
        'INVALID_REFERRAL_CODE',
        HttpStatus.BAD_REQUEST,
      );
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
