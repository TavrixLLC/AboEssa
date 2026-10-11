import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis?: Redis;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const redisUrl = config.get<string>('redis.url');
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: 2_000,
        maxRetriesPerRequest: 0,
      });
      this.redis.on('error', () => undefined);
    }
  }

  async readiness() {
    const dependencies: Record<string, 'ok' | 'unavailable' | 'disabled'> = {
      database: 'unavailable',
      redis: this.redis ? 'unavailable' : 'disabled',
    };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dependencies.database = 'ok';
    } catch {
      // Only safe high-level state is returned.
    }
    if (this.redis) {
      try {
        if (this.redis.status === 'wait') await this.redis.connect();
        dependencies.redis = (await this.redis.ping()) === 'PONG' ? 'ok' : 'unavailable';
      } catch {
        dependencies.redis = 'unavailable';
      }
    }
    const ready =
      dependencies.database === 'ok' &&
      (dependencies.redis === 'ok' || dependencies.redis === 'disabled');
    return { ready, dependencies, timestamp: new Date().toISOString() };
  }

  async onModuleDestroy() {
    if (this.redis && this.redis.status !== 'end') this.redis.disconnect();
  }
}
