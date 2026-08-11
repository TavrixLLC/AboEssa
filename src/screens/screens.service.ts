import { Injectable } from '@nestjs/common';
import { ActorType, ScreenStatus } from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { TokenService } from 'src/auth/token.service';
import { PasswordService } from 'src/common/security/password.service';
import { CreateScreenDto } from 'src/screens/dto/create-screen.dto';
import { RenameScreenDto } from 'src/screens/dto/rename-screen.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ScreensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly passwordService: PasswordService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(dto: CreateScreenDto, adminId: string, request: Request) {
    const screen = await this.prisma.screenDevice.create({
      data: {
        name: dto.name,
        tokenHash: 'pending',
        tokenVersion: 0,
        status: ScreenStatus.ACTIVE,
        isActive: true,
      },
    });
    const accessToken = await this.tokenService.signScreenAccess(screen.id, screen.tokenVersion);
    const updated = await this.prisma.screenDevice.update({
      where: { id: screen.id },
      data: { tokenHash: await this.passwordService.hash(accessToken) },
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'SCREEN_CREATED',
      entityType: 'ScreenDevice',
      entityId: updated.id,
      metadata: { name: updated.name },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return { screen: this.safeScreen(updated), accessToken };
  }

  findAll() {
    return this.prisma.screenDevice.findMany({
      orderBy: { createdAt: 'desc' },
      select: this.safeScreenSelect(),
    });
  }

  async revoke(id: string, adminId: string, request: Request) {
    const screen = await this.prisma.screenDevice.update({
      where: { id },
      data: {
        status: ScreenStatus.REVOKED,
        isActive: false,
        tokenVersion: { increment: 1 },
      },
    });

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

  async rename(id: string, dto: RenameScreenDto, adminId: string, request: Request) {
    const screen = await this.prisma.screenDevice.update({
      where: { id },
      data: { name: dto.name },
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
    const screen = await this.prisma.screenDevice.update({
      where: { id },
      data: { lastSeenAt: new Date() },
    });
    return this.safeScreen(screen);
  }

  private safeScreen(screen: {
    id: string;
    name: string;
    tokenVersion: number;
    status: ScreenStatus;
    isActive: boolean;
    lastSeenAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: screen.id,
      name: screen.name,
      tokenVersion: screen.tokenVersion,
      status: screen.status,
      isActive: screen.isActive,
      lastSeenAt: screen.lastSeenAt,
      createdAt: screen.createdAt,
      updatedAt: screen.updatedAt,
    };
  }

  private safeScreenSelect() {
    return {
      id: true,
      name: true,
      tokenVersion: true,
      status: true,
      isActive: true,
      lastSeenAt: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Record<string, boolean>;
  }
}

