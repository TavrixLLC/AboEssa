import { Injectable } from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { AuditLogQueryDto } from 'src/audit-logs/dto/audit-log-query.dto';
import { hashRequestMetadata } from 'src/common/security/hash.util';
import { getPagination, toPaginatedResult } from 'src/common/pagination/pagination.dto';
import { PrismaService } from 'src/prisma/prisma.service';

type AuditLogInput = {
  actorType: ActorType;
  actorId?: string;
  action: string;
  summary?: string;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
  userAgent?: string | string[];
};

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        summary: input.summary,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: sanitizeAuditMetadata(input.metadata),
        ipHash: hashRequestMetadata(input.ip),
        userAgentHash: hashRequestMetadata(input.userAgent),
      },
    });
  }

  async findAll(query: AuditLogQueryDto) {
    const pagination = getPagination(query);
    const where: Prisma.AuditLogWhereInput = {
      actorType: query.actorType,
      actorId: query.actorId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return toPaginatedResult(items, total, pagination.page, pagination.limit);
  }

  findOne(id: string) {
    return this.prisma.auditLog.findUniqueOrThrow({ where: { id } });
  }
}

const SENSITIVE_KEY_PARTS = ['password', 'token', 'authorization', 'credential', 'secret', 'otp', 'cookie'];

const isSensitiveKey = (key: string) => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
};

const sanitizeAuditMetadata = (value: Prisma.InputJsonValue | undefined): Prisma.InputJsonValue | undefined => {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map((entry) => sanitizeAuditMetadata(entry as Prisma.InputJsonValue)) as Prisma.InputJsonValue;
  if (typeof value === 'object') {
    const output: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = isSensitiveKey(key) ? '[REDACTED]' : (sanitizeAuditMetadata(entry as Prisma.InputJsonValue) as Prisma.InputJsonValue);
    }
    return output;
  }
  return value;
};
