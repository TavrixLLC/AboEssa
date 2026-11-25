import { fork } from 'node:child_process';
import { join } from 'node:path';
import { CodecInput, CodecOutput } from './enhancement-codec';
let active = false;
export function isolatedEnhancement(input: CodecInput): Promise<CodecOutput> {
  if (active) return Promise.reject(new Error('IMAGE_LOCAL_BUSY'));
  active = true;
  return new Promise((resolve, reject) => {
    // No database, signing key or provider credential is inherited by the image worker.
    const child = fork(join(__dirname, 'enhancement-child.js'), [], {
      execArgv: ['--max-old-space-size=128'],
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: {
        PATH: process.env.PATH,
        NODE_PATH: join(require.resolve('sharp'), '../../..'),
        SystemRoot: process.env.SystemRoot,
        NODE_ENV: 'production',
        VIPS_CONCURRENCY: '1',
        MALLOC_ARENA_MAX: '2',
      },
    });
    let done = false;
    const finish = (error?: Error, value?: CodecOutput) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      active = false;
      child.kill();
      if (error) reject(error);
      else resolve(value!);
    };
    const timer = setTimeout(() => finish(new Error('IMAGE_LOCAL_TIMEOUT')), 30000);
    child.once('message', (msg: { error?: string; value?: CodecOutput }) =>
      finish(
        msg.error
          ? new Error(/^[A-Z0-9_]{1,100}$/.test(msg.error) ? msg.error : 'IMAGE_CODEC_FAILED')
          : undefined,
        msg.value,
      ),
    );
    child.once('error', () => finish(new Error('IMAGE_WORKER_FAILED')));
    child.once('exit', () => finish(new Error('IMAGE_WORKER_EXITED')));
    child.send(input, (error) => {
      if (error) finish(new Error('IMAGE_WORKER_FAILED'));
    });
  });
}
