import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import { IMAGE_ATTEMPTS, IMAGE_QUEUE, IMAGE_RECIPE } from './image-recipe';
import { ImageOptimizationService } from './image-optimization.service';

@Injectable()
export class ImageOptimizationRuntime implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ImageOptimizationRuntime.name);
  private worker?: Worker<{ id: string }>;
  private queue?: Queue<{ id: string }>;
  private isQueueReady: () => boolean = () => false;
  private timer?: ReturnType<typeof setInterval>;
  private dispatching?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly images: ImageOptimizationService,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.get<boolean>('imageOptimization.enabled')) return;
    const url = this.config.get<string>('redis.url') || 'redis://localhost:6379';
    this.queue = new Queue(IMAGE_QUEUE, {
      connection: { url, maxRetriesPerRequest: 1, enableOfflineQueue: false },
    });
    this.worker = new Worker(
      IMAGE_QUEUE,
      async (job) => {
        if (job.name === 'encode') await this.images.process(job.data.id);
      },
      {
        connection: { url, maxRetriesPerRequest: null },
        concurrency: this.config.get<number>('imageOptimization.concurrency') ?? 1,
      },
    );
    this.queue.on('error', () => this.logger.warn('Image queue unavailable'));
    this.worker.on('error', () => this.logger.warn('Image worker unavailable'));
    void this.queue.client
      .then((client) => {
        this.isQueueReady = () => client.status === 'ready';
        this.tick();
      })
      .catch(() => this.logger.warn('Image queue not ready'));
    this.timer = setInterval(() => this.tick(), 5_000);
    this.tick();
  }

  private tick() {
    if (this.dispatching || !this.isQueueReady()) return;
    this.dispatching = this.dispatch()
      .catch(() => this.logger.warn('Image dispatch deferred; pending work remains in PostgreSQL'))
      .finally(() => {
        this.dispatching = undefined;
      });
  }

  private async dispatch() {
    const queue = this.queue;
    if (!queue) return;
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'paused');
    const remainingSlots = 150 - Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (remainingSlots <= 0) return;
    const now = new Date();
    const where = {
      recipeVersion: IMAGE_RECIPE,
      status: { in: ['PENDING', 'PROCESSING'] as ('PENDING' | 'PROCESSING')[] },
      nextDispatchAt: { lte: now },
    };
    const jobs = await this.prisma.fileAssetImageJob.findMany({
      where,
      take: Math.min(50, remainingSlots),
      orderBy: [{ nextDispatchAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    for (const { id } of jobs) {
      const claim = await this.prisma.fileAssetImageJob.updateMany({
        where: { id, ...where },
        data: { nextDispatchAt: new Date(now.getTime() + 60_000) },
      });
      if (!claim.count) continue;
      // Reserving the next dispatch before enqueue bounds recovery traffic. If the
      // process crashes here, the DB row becomes eligible again in one minute.
      await queue.add(
        'encode',
        { id },
        {
          jobId: `image-${id}`,
          attempts: IMAGE_ATTEMPTS,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    }
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.dispatching;
    await Promise.all([this.worker?.close(), this.queue?.close()]);
  }
}
