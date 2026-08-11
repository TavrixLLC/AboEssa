import { HttpStatus, Injectable } from '@nestjs/common';
import { ActorType, LiveSessionStatus, Prisma } from '@prisma/client';
import { Request } from 'express';
import { AuditLogsService } from 'src/audit-logs/audit-logs.service';
import { AppException } from 'src/common/exceptions/app.exception';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { SalesSessionQueryDto } from 'src/sales-sessions/dto/sales-session-query.dto';
import { StartSalesSessionDto } from 'src/sales-sessions/dto/start-sales-session.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { SocketsService } from 'src/sockets/sockets.service';

@Injectable()
export class SalesSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly sockets: SocketsService,
  ) {}

  private toCurrentSession<T extends object>(session: T): Omit<T, 'playbackUrl'> {
    const { playbackUrl, ...current } = session as T & { playbackUrl?: unknown };
    void playbackUrl;
    return current;
  }

  async start(dto: StartSalesSessionDto, adminId: string, request: Request) {
    const active = await this.prisma.liveSession.findFirst({
      where: { status: LiveSessionStatus.ACTIVE },
      orderBy: { startedAt: 'desc' },
    });

    if (active && !dto.forceNew) {
      return this.toCurrentSession(active);
    }

    if (active && dto.forceNew) {
      await this.prisma.liveSession.update({
        where: { id: active.id },
        data: {
          status: LiveSessionStatus.ENDED,
          endedAt: new Date(),
        },
      });
    }

    const session = await this.prisma.liveSession.create({
      data: {
        title: dto.title,
        source: dto.source,
        status: LiveSessionStatus.ACTIVE,
        totalAmount: 0,
        numberOfSales: 0,
        startedAt: new Date(),
        createdByAdminId: adminId,
      },
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'SALES_SESSION_STARTED',
      entityType: 'SalesSession',
      entityId: session.id,
      metadata: { title: session.title, source: session.source },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    const currentSession = this.toCurrentSession(session);
    this.sockets.emitSessionUpdated(currentSession);
    return currentSession;
  }

  async end(id: string, adminId: string, request: Request) {
    const existing = await this.prisma.liveSession.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException(
        'Sales session was not found',
        'SESSION_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    if (existing.status === LiveSessionStatus.ENDED) {
      throw new AppException(
        'Sales session is already ended',
        'SESSION_ALREADY_ENDED',
        HttpStatus.CONFLICT,
      );
    }

    const session = await this.prisma.liveSession.update({
      where: { id },
      data: {
        status: LiveSessionStatus.ENDED,
        endedAt: new Date(),
      },
    });

    await this.auditLogs.create({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'SALES_SESSION_ENDED',
      entityType: 'SalesSession',
      entityId: session.id,
      metadata: { totalAmount: String(session.totalAmount), numberOfSales: session.numberOfSales },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    const currentSession = this.toCurrentSession(session);
    this.sockets.emitSessionEnded(currentSession);
    return currentSession;
  }

  async active() {
    const session = await this.prisma.liveSession.findFirst({
      where: { status: LiveSessionStatus.ACTIVE },
      orderBy: { startedAt: 'desc' },
    });
    return session ? this.toCurrentSession(session) : null;
  }

  async findAll(query: SalesSessionQueryDto) {
    const pagination = getPagination(query);
    const where: Prisma.LiveSessionWhereInput = {
      status: query.status,
      source: query.source,
      startedAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.liveSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.liveSession.count({ where }),
    ]);

    return toPaginatedResult(
      items.map((item) => this.toCurrentSession(item)),
      total,
      pagination.page,
      pagination.limit,
    );
  }

  async findOne(id: string) {
    const session = await this.prisma.liveSession.findUniqueOrThrow({
      where: { id },
      include: {
        orderItems: {
          take: 20,
          orderBy: { soldAt: 'desc' },
          include: { customer: true, category: true },
        },
      },
    });
    return this.toCurrentSession(session);
  }
}
