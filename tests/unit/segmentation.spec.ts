import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import {
  segmentCodec,
  validateForegroundRegion,
  validateProbabilities,
} from 'src/image-enhancement/segmentation-codec';
import {
  segmentationSettings,
  SEGMENTATION_MODELS,
} from 'src/image-enhancement/segmentation-model';

describe('Phase 7.1 mask geometry and fail-closed offline configuration', () => {
  it('defaults off; checkpoints are pinned, configuration is not an arbitrary model URL', () => {
    expect(segmentationSettings(new ConfigService())).toBeNull();
    expect(Object.keys(SEGMENTATION_MODELS)).toEqual(['u2netp', 'u2net']);
    expect(() =>
      segmentationSettings(
        new ConfigService({
          IMAGE_NEURAL_SEGMENTATION_ENABLED: 'true',
          IMAGE_SEGMENTATION_MODEL: 'toString',
          IMAGE_SEGMENTATION_MODEL_DIRECTORY: process.cwd(),
          IMAGE_SEGMENTATION_RUNTIME_DIRECTORY: process.cwd(),
        }),
      ),
    ).toThrow('SEGMENTATION_CONFIG_INVALID');
    expect(() =>
      segmentationSettings(
        new ConfigService({
          IMAGE_NEURAL_SEGMENTATION_ENABLED: 'true',
          IMAGE_SEGMENTATION_MODEL: 'anything.onnx',
        }),
      ),
    ).toThrow();
  });
  it.each([
    new Float32Array(10),
    new Float32Array(320 * 320).fill(NaN),
    new Float32Array(320 * 320).fill(0.5),
    new Float32Array(320 * 320).fill(2),
  ])('rejects malformed, flat or nonfinite output', (values) => {
    expect(() => validateProbabilities(values)).toThrow();
  });
  it.each([
    { x: 0.9, y: 0, width: 0.2, height: 1 },
    { x: -0.1, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: NaN, height: 1 },
    { x: 0, y: 0, width: 0.01, height: 1 },
  ])('refuses invalid employee regions', (region) => {
    expect(() => validateForegroundRegion(region)).toThrow('SEGMENTATION_REGION_INVALID');
  });
  it('inverse letterbox returns one channel aligned to full source, retaining original RGB and holes', async () => {
    const bytes = await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#134b83' },
    })
      .png()
      .toBuffer();
    const out = await segmentCodec(
      { bytes, mime: 'image/png', background: 'WHITE' },
      async (tensor) => {
        expect(tensor.length).toBe(3 * 320 * 320);
        expect(tensor[0]).toBe(0); // normalized padding, no stretched object
        const probabilities = new Float32Array(320 * 320);
        for (let y = 100; y < 220; y++)
          for (let x = 80; x < 240; x++) probabilities[y * 320 + x] = 1;
        probabilities[160 * 320 + 160] = 0; // no broad hole filling
        return { probabilities, inferenceMs: 1 };
      },
    );
    const mask = await sharp(out.mask).greyscale().raw().toBuffer({ resolveWithObject: true });
    expect(mask.info.width).toBe(400);
    expect(mask.info.height).toBe(200);
    const fg = await sharp(out.foreground!).raw().toBuffer();
    const p = (512 * 1024 + 500) * 4;
    expect([...fg.subarray(p, p + 4)]).toEqual([19, 75, 131, 255]);
    expect(out.warnings).toContain('HUMAN_REVIEW_REQUIRED');
  });
  it('manual region is explicit and masks cannot move into another part of the original', async () => {
    const bytes = await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#357946' },
    })
      .png()
      .toBuffer();
    const out = await segmentCodec(
      {
        bytes,
        mime: 'image/png',
        background: 'WHITE',
        region: { x: 0.5, y: 0, width: 0.5, height: 1 },
      },
      async () => {
        const probabilities = new Float32Array(320 * 320);
        for (let y = 20; y < 300; y++)
          for (let x = 40; x < 280; x++) probabilities[y * 320 + x] = 1;
        return { probabilities, inferenceMs: 1 };
      },
    );
    const raw = await sharp(out.mask).greyscale().raw().toBuffer();
    for (let y = 0; y < 200; y++)
      expect(raw.subarray(y * 400, y * 400 + 200).every((n) => n === 0)).toBe(true);
    expect(out.warnings).toContain('EMPLOYEE_REGION_GUIDED_REVIEW_ALL_PARTS');
  });
});
