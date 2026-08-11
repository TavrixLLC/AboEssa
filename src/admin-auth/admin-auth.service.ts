import { HttpStatus, Injectable } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { StaffService } from 'src/admin-users/staff.service';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { TokenService } from 'src/auth/token.service';
import { AppException } from 'src/common/exceptions/app.exception';
import { PasswordService } from 'src/common/security/password.service';
import { toSafeAdminUser } from 'src/common/utils/safe-user.util';
import { AdminLoginDto } from 'src/admin-auth/dto/admin-login.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly auditLogs: AuditLogsService,
    private readonly staffService: StaffService,
  ) {}

  async login(dto: AdminLoginDto, request: Request) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const admin = await this.prisma.adminUser.findUnique({ where: { normalizedEmail } });

    const valid = admin ? await this.passwordService.verify(admin.passwordHash, dto.password) : false;
    if (!admin || !valid || !admin.isActive || admin.status !== 'ACTIVE') {
      await this.auditLogs.create({
        actorType: ActorType.ADMIN,
        actorId: admin?.id,
        action: 'admin.login_failed',
        entityType: 'AdminUser',
        entityId: admin?.id,
        metadata: { email: normalizedEmail },
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      throw new AppException('Invalid email or password', 'INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED);
    }

    const sessionId = randomUUID();
    const refreshToken = this.tokenService.createRefreshToken(admin.id, sessionId);
    const refreshTokenHash = await this.tokenService.hashRefreshToken(refreshToken);
    const updated = await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        refreshTokenHash,
        lastLoginAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
    await this.staffService.createSession(admin.id, { id: sessionId, refreshTokenHash, ip: request.ip, userAgent: request.headers['user-agent'], deviceName: this.header(request, 'x-device-name'), platform: this.header(request, 'x-platform'), appVersion: this.header(request, 'x-app-version') });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: admin.id,
      action: 'admin.login_success',
      entityType: 'AdminUser',
      entityId: admin.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return {
      accessToken: await this.tokenService.signAdminAccess(updated, sessionId),
      refreshToken,
      refreshExpiresAt: this.tokenService.getRefreshExpiryDate(),
      admin: toSafeAdminUser(updated),
    };
  }

  async refresh(refreshToken: string, request: Request) {
    const adminId = this.tokenService.parseRefreshSubject(refreshToken);
    if (!adminId) {
      throw new AppException('Invalid refresh token', 'INVALID_REFRESH_TOKEN', HttpStatus.UNAUTHORIZED);
    }

    const sessionId = this.tokenService.parseRefreshSession(refreshToken);
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin?.isActive || admin.status !== 'ACTIVE') {
      throw new AppException('Invalid refresh token', 'INVALID_REFRESH_TOKEN', HttpStatus.UNAUTHORIZED);
    }

    if (sessionId) {
      const session = await this.prisma.adminSession.findFirst({ where: { id: sessionId, adminUserId: admin.id } });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new AppException('Invalid refresh token', 'INVALID_REFRESH_TOKEN', HttpStatus.UNAUTHORIZED);
      const valid = await this.tokenService.verifyRefreshToken(session.refreshTokenHash, refreshToken);
      if (!valid) {
        await this.prisma.adminSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
        await this.auditLogs.create({ actorType: ActorType.ADMIN, actorId: admin.id, action: 'admin.refresh_reuse_detected', entityType: 'AdminSession', entityId: session.id, ip: request.ip, userAgent: request.headers['user-agent'] });
        throw new AppException('Refresh token reuse detected', 'REFRESH_TOKEN_REUSE', HttpStatus.UNAUTHORIZED);
      }
      const nextRefreshToken = this.tokenService.createRefreshToken(admin.id, session.id);
      const nextRefreshTokenHash = await this.tokenService.hashRefreshToken(nextRefreshToken);
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.adminSession.update({ where: { id: session.id }, data: { refreshTokenHash: nextRefreshTokenHash, lastUsedAt: new Date() } });
        return tx.adminUser.update({ where: { id: admin.id }, data: { refreshTokenHash: nextRefreshTokenHash, lastSeenAt: new Date() } });
      });
      return { accessToken: await this.tokenService.signAdminAccess(updated, session.id), refreshToken: nextRefreshToken, refreshExpiresAt: this.tokenService.getRefreshExpiryDate(), admin: toSafeAdminUser(updated) };
    }

    if (!admin.refreshTokenHash) {
      throw new AppException('Invalid refresh token', 'INVALID_REFRESH_TOKEN', HttpStatus.UNAUTHORIZED);
    }
    const valid = await this.tokenService.verifyRefreshToken(admin.refreshTokenHash, refreshToken);
    if (!valid) {
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          refreshTokenHash: null,
          tokenVersion: { increment: 1 },
        },
      });
      await this.auditLogs.create({
        actorType: ActorType.ADMIN,
        actorId: admin.id,
        action: 'admin.refresh_reuse_detected',
        entityType: 'AdminUser',
        entityId: admin.id,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      throw new AppException('Refresh token reuse detected', 'REFRESH_TOKEN_REUSE', HttpStatus.UNAUTHORIZED);
    }

    const nextRefreshToken = this.tokenService.createRefreshToken(admin.id);
    const nextRefreshTokenHash = await this.tokenService.hashRefreshToken(nextRefreshToken);
    const updated = await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { refreshTokenHash: nextRefreshTokenHash },
    });

    return {
      accessToken: await this.tokenService.signAdminAccess(updated),
      refreshToken: nextRefreshToken,
      refreshExpiresAt: this.tokenService.getRefreshExpiryDate(),
      admin: toSafeAdminUser(updated),
    };
  }

  async logout(adminId: string, request: Request) {
    const sessionId = this.sessionIdFromRequest(request);
    if (sessionId) {
      await this.prisma.adminSession.updateMany({ where: { id: sessionId, adminUserId: adminId }, data: { revokedAt: new Date() } });
    } else {
      await this.prisma.adminUser.update({ where: { id: adminId }, data: { refreshTokenHash: null, tokenVersion: { increment: 1 } } });
    }

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'admin.logout',
      entityType: 'AdminUser',
      entityId: adminId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return { loggedOut: true };
  }

  async me(adminId: string) {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    return toSafeAdminUser(admin);
  }

  async changePassword(adminId: string, currentPassword: string, newPassword: string, request: Request, sessionId?: string) {
    return this.staffService.changeOwnPassword(adminId, currentPassword, newPassword, sessionId, request);
  }

  private header(request: Request, name: string) {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }

  private sessionIdFromRequest(request: Request) {
    return (request as Request & { user?: { sessionId?: string } }).user?.sessionId;
  }
}
