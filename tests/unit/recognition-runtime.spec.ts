import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { RecognitionRuntime } from 'src/ai/recognition.runtime';
jest.mock('bullmq', () => ({ Queue: jest.fn(), Worker: jest.fn() }));
describe('Recognition runtime availability boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());
  it('does not construct Redis workers when the AI flag is off', async () => {
    const runtime = new RecognitionRuntime(new ConfigService(), {} as any, {} as any);
    runtime.onApplicationBootstrap();
    await runtime.onApplicationShutdown();
    expect(Queue).not.toHaveBeenCalled();
    expect(Worker).not.toHaveBeenCalled();
  });
  it('handles rejected queue initialization without an unhandled rejection or losing manual intake', async () => {
    const queue = {
      client: Promise.reject(new Error('redis unavailable')),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const worker = { on: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
    (Queue as unknown as jest.Mock).mockImplementation(() => queue);
    (Worker as unknown as jest.Mock).mockImplementation(() => worker);
    const db = { productRecognitionTask: { findMany: jest.fn() } };
    const runtime = new RecognitionRuntime(
      new ConfigService({
        AI_RECOGNITION_ENABLED: 'true',
        intake: { enabled: true },
        inventory: { managementEnabled: true },
        redis: { url: 'redis://qa-only.invalid' },
      }),
      db as any,
      {} as any,
    );
    runtime.onApplicationBootstrap();
    await Promise.resolve();
    await Promise.resolve();
    await runtime.onApplicationShutdown();
    expect(db.productRecognitionTask.findMany).not.toHaveBeenCalled();
    expect(queue.close).toHaveBeenCalled();
    expect(worker.close).toHaveBeenCalled();
  });
});
