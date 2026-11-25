import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { SegmentInput, segmentCodec } from './segmentation-codec';
import {
  SEGMENTATION_MODELS,
  SEGMENTATION_RUNTIME_VERSION,
  SegmentationModel,
} from './segmentation-model';

type Tensor = { data: Float32Array; dispose(): void };
type Session = {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, Tensor>, outputNames: string[]): Promise<Record<string, Tensor>>;
};
type Ort = {
  Tensor: new (kind: string, data: Float32Array, dims: number[]) => Tensor;
  InferenceSession: { create(bytes: Buffer, options: Record<string, unknown>): Promise<Session> };
};
const loadModule = createRequire(__filename);
let session: Session,
  ort: Ort,
  ready: Promise<void> | undefined,
  busy = false,
  jobs = 0,
  loadMs = 0;
const model = process.env.REZONA_SEGMENTATION_MODEL as SegmentationModel;
const pin = SEGMENTATION_MODELS[model];
async function initialize() {
  const start = performance.now();
  if (!pin) throw new Error('SEGMENTATION_MODEL_INVALID');
  const runtime = process.env.REZONA_SEGMENTATION_RUNTIME!;
  if (
    (loadModule(join(runtime, 'node_modules/onnxruntime-node/package.json')) as { version: string })
      .version !== SEGMENTATION_RUNTIME_VERSION
  )
    throw new Error('SEGMENTATION_RUNTIME_MISMATCH');
  const bytes = await readFile(process.env.REZONA_SEGMENTATION_FILE!);
  if (bytes.length !== pin.bytes || createHash('sha256').update(bytes).digest('hex') !== pin.sha256)
    throw new Error('SEGMENTATION_MODEL_CHECKSUM');
  ort = loadModule(join(runtime, 'node_modules/onnxruntime-node')) as Ort;
  session = await ort.InferenceSession.create(bytes, {
    executionProviders: ['cpu'],
    intraOpNumThreads: 2,
    interOpNumThreads: 1,
    executionMode: 'sequential',
    graphOptimizationLevel: 'all',
  });
  if (session.inputNames[0] !== 'input.1' || session.outputNames[0] !== '1959')
    throw new Error('SEGMENTATION_GRAPH_MISMATCH');
  loadMs = Math.round(performance.now() - start);
}
process.on('disconnect', () => process.exit(0));
async function processImage(input: SegmentInput) {
  if (busy) {
    process.send?.({ error: 'SEGMENTATION_BUSY' });
    return;
  }
  busy = true;
  global.gc?.(); // Reclaim prior IPC/image buffers; native allocations still need separate RSS monitoring.
  let peak = process.memoryUsage().rss;
  const sample = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
    if (peak > (model === 'u2net' ? 1024 : 768) * 1024 * 1024) process.exit(73);
  }, 100);
  try {
    const cold = !ready;
    ready ??= initialize();
    await ready;
    const result = await segmentCodec(input, async (tensor) => {
      const start = performance.now();
      const feed = new ort.Tensor('float32', tensor, [1, 3, 320, 320]);
      const values = await session.run({ 'input.1': feed }, ['1959']);
      try {
        return {
          probabilities: Float32Array.from(values['1959'].data),
          inferenceMs: Math.round(performance.now() - start),
        };
      } finally {
        feed.dispose();
        values['1959'].dispose();
      }
    });
    peak = Math.max(peak, process.memoryUsage().rss);
    result.details = {
      ...result.details,
      model,
      modelRevision: pin.sha256,
      runtime: SEGMENTATION_RUNTIME_VERSION,
      cold,
      loadMs: cold ? loadMs : 0,
      sampledPeakRssBytes: peak,
      rssSamplingIntervalMs: 100,
      rssIsSampledNotHardNativeLimit: true,
      jobsInProcess: ++jobs,
    };
    process.send?.({ value: result });
  } catch (e) {
    process.send?.({ error: (e as Error).message });
  } finally {
    clearInterval(sample);
    busy = false;
  }
}
process.on('message', (input: SegmentInput) => {
  void processImage(input);
});
