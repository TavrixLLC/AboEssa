import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType, ScreenStatus } from '@prisma/client';
import { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { TokenService } from 'src/auth/token.service';
import { AppException } from 'src/common/exceptions/app.exception';
import { PasswordService } from 'src/common/security/password.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePairingChallengeDto } from 'src/screens/dto/create-pairing-challenge.dto';
import { PairScreenDto } from 'src/screens/dto/pair-screen.dto';
import { PairingStatusDto } from 'src/screens/dto/pairing-status.dto';
import { RenameScreenDto } from 'src/screens/dto/rename-screen.dto';
import { SocketsService } from 'src/sockets/sockets.service';

@Injectable()
export class ScreensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly passwordService: PasswordService,
    private readonly auditLogs: AuditLogsService,
    private readonly config: ConfigService,
    private readonly sockets: SocketsService,
  ) {}

  async createPairingChallenge(dto: CreatePairingChallengeDto) {
    const now = new Date();
    const ttlSeconds = this.config.get<number>('screens.pairingTtlSeconds') ?? 300;
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const code = randomBytes(32).toString('base64url');

    await this.prisma.screenPairingChallenge.updateMany({
      where: {
        installationId: dto.installationId,
        usedAt: null,
        cancelledAt: null,
        expiresAt: { gt: now },
      },
      data: { cancelledAt: now },
    });

    const challenge = await this.prisma.screenPairingChallenge.create({
      data: {
        installationId: dto.installationId,
        codeHash: await this.passwordService.hash(code),
        expiresAt,
      },
    });

    const pairingUri = `aboessa://display/pair?challenge=${encodeURIComponent(challenge.id)}&code=${encodeURIComponent(code)}`;
    return { challengeId: challenge.id, pairingUri, expiresAt };
  }

  async pairingStatus(id: string, dto: PairingStatusDto) {
    const challenge = await this.getVerifiedChallenge(id, dto.code);
    const now = new Date();

    if (challenge.cancelledAt) return { status: 'CANCELLED' as const };
    if (challenge.expiresAt <= now) return { status: 'EXPIRED' as const };
    if (!challenge.usedAt || !challenge.screenDeviceId) return { status: 'PENDING' as const };

    const screen = await this.prisma.screenDevice.findUnique({
      where: { id: challenge.screenDeviceId },
    });
    if (!screen || !screen.isActive || screen.status !== ScreenStatus.ACTIVE) {
      return { status: 'REVOKED' as const };
    }
    if (challenge.credentialIssuedAt) {
      return { status: 'PAIRED' as const, credentialIssued: true };
    }

    const accessToken = await this.tokenService.signScreenAccess(screen.id, screen.tokenVersion);
    const tokenHash = await this.passwordService.hash(accessToken);
    const issued = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.screenPairingChallenge.updateMany({
        where: { id: challenge.id, credentialIssuedAt: null },
        data: { credentialIssuedAt: now },
      });
      if (claimed.count !== 1) return false;
      await tx.screenDevice.update({
        where: { id: screen.id },
        data: { tokenHash, lastSeenAt: now },
      });
      return true;
    });

    if (!issued) return { status: 'PAIRED' as const, credentialIssued: true };
    return {
      status: 'PAIRED' as const,
      credentialIssued: true,
      screen: this.safeScreen({ ...screen, lastSeenAt: now }),
      accessToken,
    };
  }

  async pair(dto: PairScreenDto, adminId: string, request: Request) {
    const challenge = await this.getVerifiedChallenge(dto.challengeId, dto.code);
    const now = new Date();
    if (challenge.cancelledAt) {
      throw new AppException(
        'Pairing challenge was cancelled',
        'PAIRING_CANCELLED',
        HttpStatus.GONE,
      );
    }
    if (challenge.expiresAt <= now) {
      throw new AppException('Pairing challenge expired', 'PAIRING_EXPIRED', HttpStatus.GONE);
    }
    if (challenge.usedAt) {
      throw new AppException(
        'Pairing challenge was already used',
        'PAIRING_ALREADY_USED',
        HttpStatus.CONFLICT,
      );
    }

    const name = dto.name?.trim() || 'Shanashil Display';
    const screen = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.screenPairingChallenge.updateMany({
        where: {
          id: challenge.id,
          usedAt: null,
          cancelledAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new AppException(
          'Pairing challenge is no longer available',
          'PAIRING_ALREADY_USED',
          HttpStatus.CONFLICT,
        );
      }

      const paired = await tx.screenDevice.upsert({
        where: { installationId: challenge.installationId },
        create: {
          installationId: challenge.installationId,
          name,
          tokenHash: 'pending-pairing-delivery',
          status: ScreenStatus.ACTIVE,
          isActive: true,
          pairedAt: now,
        },
        update: {
          name,
          tokenHash: 'pending-pairing-delivery',
          tokenVersion: { increment: 1 },
          status: ScreenStatus.ACTIVE,
          isActive: true,
          pairedAt: now,
          revokedAt: null,
        },
      });
      await tx.screenPairingChallenge.update({
        where: { id: challenge.id },
        data: { screenDeviceId: paired.id },
      });
      return paired;
    });

    this.sockets.disconnectScreen(screen.id);

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'SCREEN_PAIRED',
      entityType: 'ScreenDevice',
      entityId: screen.id,
      metadata: { name: screen.name },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return this.safeScreen(screen);
  }

  async findAll() {
    const screens = await this.prisma.screenDevice.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return screens.map((screen) => this.safeScreen(screen));
  }

  async revoke(id: string, adminId: string, request: Request) {
    const screen = await this.revokeDevice(id);
    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'SCREEN_REVOKED',
      entityType: 'ScreenDevice',
      entityId: id,
      metadata: { name: screen.name },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return this.safeScreen(screen);
  }

  async revokeSelf(id: string, request: Request) {
    const screen = await this.revokeDevice(id);
    await this.auditLogs.create({
      actorType: ActorType.SCREEN,
      actorId: id,
      action: 'SCREEN_SELF_REVOKED',
      entityType: 'ScreenDevice',
      entityId: id,
      metadata: { name: screen.name },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return { revoked: true };
  }

  async rename(id: string, dto: RenameScreenDto, adminId: string, request: Request) {
    const screen = await this.prisma.screenDevice.update({
      where: { id },
      data: { name: dto.name.trim() },
    });
    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'SCREEN_RENAMED',
      entityType: 'ScreenDevice',
      entityId: id,
      metadata: { name: screen.name },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return this.safeScreen(screen);
  }

  async me(id: string) {
    await this.touchLastSeen(id);
    const screen = await this.prisma.screenDevice.findUniqueOrThrow({ where: { id } });
    return this.safeScreen(screen);
  }

  async recentQuickSales(id: string) {
    await this.touchLastSeen(id);
    const records = await this.prisma.quickSaleDisplayRecord.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: {
        id: true,
        customerDisplayName: true,
        amount: true,
        currency: true,
        createdAt: true,
      },
    });
    return records.map((record) => ({ ...record, amount: record.amount.toString() }));
  }

  private async getVerifiedChallenge(id: string, code: string) {
    const challenge = await this.prisma.screenPairingChallenge.findUnique({ where: { id } });
    if (!challenge || !(await this.passwordService.verify(challenge.codeHash, code))) {
      throw new AppException(
        'Invalid pairing challenge',
        'PAIRING_INVALID',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return challenge;
  }

  private async revokeDevice(id: string) {
    const screen = await this.prisma.screenDevice.update({
      where: { id },
      data: {
        status: ScreenStatus.REVOKED,
        isActive: false,
        revokedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });
    this.sockets.disconnectScreen(id);
    return screen;
  }

  private async touchLastSeen(id: string) {
    const threshold = new Date(Date.now() - 60_000);
    await this.prisma.screenDevice.updateMany({
      where: { id, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: threshold } }] },
      data: { lastSeenAt: new Date() },
    });
  }

  private safeScreen(screen: {
    id: string;
    name: string;
    status: ScreenStatus;
    isActive: boolean;
    pairedAt: Date | null;
    lastSeenAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const onlineWindow = this.config.get<number>('screens.onlineWindowSeconds') ?? 120;
    const online =
      screen.status === ScreenStatus.ACTIVE &&
      screen.isActive &&
      !!screen.lastSeenAt &&
      screen.lastSeenAt.getTime() >= Date.now() - onlineWindow * 1000;
    return {
      id: screen.id,
      name: screen.name,
      status: screen.status,
      isActive: screen.isActive,
      connectionStatus: online ? 'ONLINE' : 'OFFLINE',
      pairedAt: screen.pairedAt,
      lastSeenAt: screen.lastSeenAt,
      revokedAt: screen.revokedAt,
      createdAt: screen.createdAt,
      updatedAt: screen.updatedAt,
    };
  }
}
