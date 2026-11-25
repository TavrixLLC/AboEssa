import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import { enhancementSettings } from './enhancement.config';
import { ImageEnhancementService } from './enhancement.service';
import { stopSegmentationWorker } from './segmentation-isolate';
@Injectable()
export class ImageEnhancementRuntime implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(ImageEnhancementRuntime.name);
  private queue?: Queue<{ id: string }>;
  private worker?: Worker<{ id: string }>;
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  private ready = () => false;
  constructor(
    private readonly config: ConfigService,
    private readonly db: PrismaService,
    private readonly service: ImageEnhancementService,
  ) {}
  onApplicationBootstrap() {
    if (this.config.get('IMAGE_ENHANCEMENT_ENABLED') !== 'true') return;
    const s = enhancementSettings(this.config);
    if (
      !s.enabled ||
      !s.local ||
      this.config.get('intake.enabled') !== true ||
      this.config.get('inventory.managementEnabled') !== true
    )
      return;
    const url = this.config.get<string>('redis.url')!;
    this.queue = new Queue('product-image-enhancement-v1', {
      connection: { url, maxRetriesPerRequest: 1, enableOfflineQueue: false },
    });
    this.worker = new Worker(
      'product-image-enhancement-v1',
      async (job) => this.service.process(job.data.id),
      { connection: { url, maxRetriesPerRequest: null }, concurrency: 1 },
    );
    this.queue.on('error', () => this.log.warn('Image queue unavailable; original retained'));
    this.worker.on('error', () => this.log.warn('Image worker unavailable'));
    void this.queue.client
      .then((client) => {
        this.ready = () => client.status === 'ready';
        this.tick();
      })
      .catch(() => this.log.warn('Image dispatcher waiting for Redis'));
    this.timer = setInterval(() => this.tick(), 3000);
  }
  private tick() {
    if (this.pending || !this.ready()) return;
    this.pending = this.dispatch()
      .catch(() => this.log.warn('Image dispatch deferred'))
      .finally(() => {
        this.pending = undefined;
      });
  }
  private async dispatch() {
    await this.service.recover();
    if (!this.queue) return;
    const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'paused'),
      slots = 50 - Object.values(counts).reduce((a, b) => a + b, 0);
    if (slots <= 0) return;
    const now = new Date(),
      rows = await this.db.productImageEnhancementJob.findMany({
        where: { status: 'PENDING', nextDispatchAt: { lte: now } },
        orderBy: [{ nextDispatchAt: 'asc' }, { id: 'asc' }],
        take: Math.min(10, slots),
        select: { id: true },
      });
    for (const { id } of rows) {
      const claim = await this.db.productImageEnhancementJob.updateMany({
        where: { id, status: 'PENDING', nextDispatchAt: { lte: now } },
        data: { nextDispatchAt: new Date(Date.now() + 60000) },
      });
      if (claim.count)
        await this.queue.add(
          'prepare',
          { id },
          { jobId: `image-${id}`, attempts: 1, removeOnComplete: true, removeOnFail: true },
        );
    }
  }
  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.pending;
    await Promise.all([this.worker?.close(), this.queue?.close()]);
    stopSegmentationWorker();
  }
}
