import { ConfigService } from '@nestjs/config';
import { isAbsolute, join } from 'node:path';

// This allowlist is reviewed with docs/benchmarks/phase7-1/model-license-audit.md.
// No request-time download, alternate URL, unpinned checkpoint or checksum bypass.
export const SEGMENTATION_RECIPE = 'u2net-letterbox-original-rgb-v1';
export const SEGMENTATION_RUNTIME_VERSION = '1.31.1';
export const SEGMENTATION_MODELS = {
  u2netp: {
    bytes: 4574861,
    sha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
  },
  u2net: {
    bytes: 175997641,
    sha256: '8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491',
  },
} as const;
export type SegmentationModel = keyof typeof SEGMENTATION_MODELS;
export type SegmentationSettings = {
  model: SegmentationModel;
  modelFile: string;
  runtimeDirectory: string;
};
export function segmentationSettings(c: ConfigService): SegmentationSettings | null {
  if (c.get('IMAGE_NEURAL_SEGMENTATION_ENABLED') !== 'true') return null;
  const model = c.get<string>('IMAGE_SEGMENTATION_MODEL') ?? 'u2net';
  const directory = c.get<string>('IMAGE_SEGMENTATION_MODEL_DIRECTORY') ?? '';
  const runtimeDirectory = c.get<string>('IMAGE_SEGMENTATION_RUNTIME_DIRECTORY') ?? '';
  // Full U2Net needs a fresh process per image and a reviewed >=1GiB worker budget.
  if (
    !Object.hasOwn(SEGMENTATION_MODELS, model) ||
    !isAbsolute(directory) ||
    !isAbsolute(runtimeDirectory)
  )
    throw new Error('SEGMENTATION_CONFIG_INVALID');
  return {
    model: model as SegmentationModel,
    modelFile: join(directory, model + '.onnx'),
    runtimeDirectory,
  };
}
