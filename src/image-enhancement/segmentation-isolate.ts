import { ChildProcess, fork } from 'node:child_process';
import { join } from 'node:path';
import { SegmentInput, SegmentOutput } from './segmentation-codec';
import { SegmentationSettings } from './segmentation-model';
let worker: ChildProcess | undefined,
  identity = '',
  active = false,
  count = 0;
let idle: ReturnType<typeof setTimeout> | undefined;
export function stopSegmentationWorker() {
  clearTimeout(idle);
  worker?.kill();
  worker = undefined;
  identity = '';
  count = 0;
}
export function isolatedSegmentation(
  input: SegmentInput,
  config: SegmentationSettings,
): Promise<SegmentOutput> {
  if (active) return Promise.reject(new Error('SEGMENTATION_BUSY'));
  active = true;
  clearTimeout(idle);
  return new Promise((resolve, reject) => {
    const key = JSON.stringify(config);
    if (
      !worker ||
      !worker.connected ||
      identity !== key ||
      count >= (config.model === 'u2net' ? 1 : 12)
    ) {
      stopSegmentationWorker();
      identity = key;
      worker = fork(join(__dirname, 'segmentation-child.js'), [], {
        execArgv: ['--max-old-space-size=256', '--expose-gc'],
        serialization: 'advanced',
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: {
          PATH: process.env.PATH,
          NODE_PATH: join(require.resolve('sharp'), '../../..'),
          SystemRoot: process.env.SystemRoot,
          NODE_ENV: 'production',
          VIPS_CONCURRENCY: '1',
          MALLOC_ARENA_MAX: '2',
          REZONA_SEGMENTATION_MODEL: config.model,
          REZONA_SEGMENTATION_FILE: config.modelFile,
          REZONA_SEGMENTATION_RUNTIME: config.runtimeDirectory,
        },
      });
    }
    const child = worker;
    let done = false;
    const finish = (error?: Error, value?: SegmentOutput) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      active = false;
      child.removeListener('message', message);
      child.removeListener('error', failed);
      child.removeListener('exit', failed);
      if (error) {
        stopSegmentationWorker();
        reject(error);
      } else {
        count++;
        if (config.model === 'u2net') stopSegmentationWorker();
        else {
          idle = setTimeout(stopSegmentationWorker, 60000);
          idle.unref();
        }
        resolve(value!);
      }
    };
    const message = (msg: { error?: string; value?: SegmentOutput }) => {
      if (msg.error)
        finish(new Error(/^[A-Z0-9_]{1,100}$/.test(msg.error) ? msg.error : 'SEGMENTATION_FAILED'));
      else if (
        !Buffer.isBuffer(msg.value?.png) ||
        !Buffer.isBuffer(msg.value?.mask) ||
        msg.value.png.length > 12 * 1024 * 1024 ||
        msg.value.mask.length > 12 * 1024 * 1024
      )
        finish(new Error('SEGMENTATION_OUTPUT_INVALID'));
      else finish(undefined, msg.value);
    };
    const failed = () => finish(new Error('SEGMENTATION_WORKER_FAILED'));
    const timer = setTimeout(() => finish(new Error('SEGMENTATION_TIMEOUT')), 45000);
    child.once('message', message);
    child.once('error', failed);
    child.once('exit', failed);
    child.send(input, (error) => {
      if (error) failed();
    });
  });
}
