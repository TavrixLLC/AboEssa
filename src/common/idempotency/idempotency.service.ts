import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType } from '@prisma/client';
import { IDEMPOTENCY_KEY_HEADER } from 'src/common/constants/app.constants';
import { AppException } from 'src/common/exceptions/app.exception';
import { sha256 } from 'src/common/security/hash.util';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  hashBody(body: unknown) {
    return sha256(JSON.stringify(body ?? {}));
  }

  requireKey(headers: Record<string, string | string[] | undefined>) {
    const raw = headers[IDEMPOTENCY_KEY_HEADER] ?? headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key?.trim()) {
      throw new AppException('Idempotency-Key header is required', 'IDEMPOTENCY_KEY_REQUIRED', HttpStatus.BAD_REQUEST);
    }
    return key.trim();
  }

  async findExisting(params: {
    key: string;
    actorType: ActorType;
    actorId: string;
    endpoint: string;
  }) {
    const { key, actorType, actorId, endpoint } = params;
    return this.prisma.idempotencyKey.findUnique({
      where: {
        key_actorType_actorId_endpoint: {
          key,
          actorType,
          actorId,
          endpoint,
        },
      },
    });
  }

  async getReplayOrThrowConflict(params: {
    key: string;
    actorType: ActorType;
    actorId: string;
    endpoint: string;
    requestHash: string;
  }) {
    const existing = await this.findExisting(params);
    if (!existing) {
      return undefined;
    }

    if (existing.requestHash !== params.requestHash) {
      throw new AppException(
        'Idempotency key was already used with a different request body',
        'IDEMPOTENCY_CONFLICT',
        HttpStatus.CONFLICT,
      );
    }

    return existing.responseJson;
  }

  async store(params: {
    key: string;
    actorType: ActorType;
    actorId: string;
    endpoint: string;
    requestHash: string;
    responseJson: unknown;
    statusCode: number;
    expiresAt: Date;
  }) {
    return this.prisma.idempotencyKey.create({
      data: {
        key: params.key,
        actorType: params.actorType,
        actorId: params.actorId,
        endpoint: params.endpoint,
        requestHash: params.requestHash,
        responseJson: JSON.parse(JSON.stringify(params.responseJson)) as object,
        statusCode: params.statusCode,
        expiresAt: params.expiresAt,
      },
    });
  }

  getExpiryDate() {
    const ttlSeconds = this.config.get<number>('idempotency.ttlSeconds') ?? 86400;
    return new Date(Date.now() + ttlSeconds * 1000);
  }
}
