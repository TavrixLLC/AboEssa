import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import { RecognitionService } from './recognition.service';
import { aiSettings } from './ai.config';

@Injectable()
export class RecognitionRuntime implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RecognitionRuntime.name);
  private queue?: Queue<{ id: string }>;
  private worker?: Worker<{ id: string }>;
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  private ready = () => false;
  constructor(
    private readonly config: ConfigService,
    private readonly db: PrismaService,
    private readonly recognition: RecognitionService,
  ) {}
  onApplicationBootstrap() {
    const settings = aiSettings(this.config);
    if (
      !settings.enabled ||
      this.config.get<boolean>('intake.enabled') !== true ||
      this.config.get<boolean>('inventory.managementEnabled') !== true
    )
      return;
    const url = this.config.get<string>('redis.url')!;
    this.queue = new Queue('product-recognition-v1', {
      connection: { url, maxRetriesPerRequest: 1, enableOfflineQueue: false },
    });
    this.worker = new Worker(
      'product-recognition-v1',
      async (job) => this.recognition.process(job.data.id),
      {
        connection: { url, maxRetriesPerRequest: null },
        concurrency: settings.concurrency,
      },
    );
    this.queue.on('error', () =>
      this.logger.warn('Recognition queue unavailable; durable drafts retained'),
    );
    this.worker.on('error', () => this.logger.warn('Recognition worker unavailable'));
    void this.queue.client
      .then((client) => {
        this.ready = () => client.status === 'ready';
        this.tick();
      })
      .catch(() =>
        this.logger.warn('Recognition queue not ready; manual intake remains available'),
      );
    this.timer = setInterval(() => this.tick(), 5000);
  }
  private tick() {
    if (this.pending || !this.ready()) return;
    this.pending = this.dispatch()
      .catch(() => this.logger.warn('Recognition dispatch deferred'))
      .finally(() => {
        this.pending = undefined;
      });
  }
  private async dispatch() {
    const now = new Date();
    await this.db.recognitionUsage.updateMany({
      where: { purpose: 'RECOGNITION', status: 'RESERVED', createdAt: { lt: new Date(now.getTime() - 120000) } },
      data: { status: 'UNKNOWN', errorCode: 'AI_WORKER_OUTCOME_UNKNOWN', completedAt: now },
    });
    const expired = await this.db.productRecognitionTask.findMany({
      where: { status: 'PROCESSING', nextDispatchAt: { lte: now } },
      select: { id: true },
      take: 20,
    });
    for (const { id } of expired) await this.recognition.process(id);
    if (!this.queue) return;
    const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'paused');
    const slots = 100 - Object.values(counts).reduce((a, b) => a + b, 0);
    if (slots <= 0) return;
    const tasks = await this.db.productRecognitionTask.findMany({
      where: { status: 'PENDING', nextDispatchAt: { lte: now } },
      orderBy: [{ nextDispatchAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
      take: Math.min(20, slots),
    });
    for (const { id } of tasks) {
      const claim = await this.db.productRecognitionTask.updateMany({
        where: { id, status: 'PENDING', nextDispatchAt: { lte: now } },
        data: { nextDispatchAt: new Date(now.getTime() + 60000) },
      });
      if (!claim.count) continue;
      await this.queue.add(
        'recognize',
        { id },
        {
          jobId: `recognition-${id}`,
          attempts: 2,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    }
  }
  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.pending;
    await Promise.all([this.worker?.close(), this.queue?.close()]);
  }
}
