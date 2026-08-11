import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminUser, Customer } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { TokenType } from 'src/common/enums/token-type.enum';
import { PasswordService } from 'src/common/security/password.service';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly passwordService: PasswordService,
  ) {}

  signAdminAccess(admin: AdminUser, sessionId?: string) {
    return this.jwtService.signAsync(
      {
        sub: admin.id,
        type: TokenType.Admin,
        role: admin.role,
        permissions: admin.permissions,
        tokenVersion: admin.tokenVersion,
        sessionId,
      },
      {
        secret: this.config.getOrThrow<string>('jwt.adminAccessSecret'),
        expiresIn: this.config.getOrThrow<string>('jwt.adminAccessTtl') as never,
      },
    );
  }

  signCustomerAccess(customer: Customer) {
    return this.jwtService.signAsync(
      {
        sub: customer.id,
        type: TokenType.Customer,
      },
      {
        secret: this.config.getOrThrow<string>('jwt.customerAccessSecret'),
        expiresIn: this.config.getOrThrow<string>('jwt.customerAccessTtl') as never,
      },
    );
  }

  signScreenAccess(screenId: string, tokenVersion: number) {
    return this.jwtService.signAsync(
      {
        sub: screenId,
        type: TokenType.Screen,
        tokenVersion,
      },
      {
        secret: this.config.getOrThrow<string>('jwt.screenAccessSecret'),
        expiresIn: this.config.getOrThrow<string>('jwt.screenAccessTtl') as never,
      },
    );
  }

  createRefreshToken(subjectId: string, sessionId?: string) {
    return sessionId
      ? `${subjectId}.${sessionId}.${randomBytes(48).toString('base64url')}`
      : `${subjectId}.${randomBytes(48).toString('base64url')}`;
  }

  parseRefreshSubject(refreshToken: string) {
    const [subjectId, secret] = refreshToken.split('.');
    if (!subjectId || !secret) {
      return undefined;
    }
    return subjectId;
  }

  parseRefreshSession(refreshToken: string) {
    const parts = refreshToken.split('.');
    return parts.length === 3 ? parts[1] : undefined;
  }

  hashRefreshToken(refreshToken: string) {
    return this.passwordService.hash(refreshToken);
  }

  verifyRefreshToken(hash: string, refreshToken: string) {
    return this.passwordService.verify(hash, refreshToken);
  }

  getRefreshExpiryDate() {
    const days = this.config.get<number>('jwt.refreshTokenDays') ?? 30;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
