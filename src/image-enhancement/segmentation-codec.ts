import sharp from 'sharp';
import { CodecOutput } from './enhancement-codec';
import { SEGMENTATION_RECIPE } from './segmentation-model';

export type ForegroundRegion = { x: number; y: number; width: number; height: number };
export function validateForegroundRegion(region: ForegroundRegion) {
  const { x, y, width, height } = region;
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    width < 0.05 ||
    height < 0.05 ||
    x + width > 1.000001 ||
    y + height > 1.000001
  )
    throw new Error('SEGMENTATION_REGION_INVALID');
}
export type SegmentInput = {
  bytes: Buffer;
  mime: string;
  background: string;
  region?: ForegroundRegion;
};
export type SegmentOutput = CodecOutput & { mask: Buffer; details: Record<string, unknown> };
type Prediction = { probabilities: Float32Array; inferenceMs: number };

export function validateProbabilities(values: Float32Array) {
  if (values.length !== 320 * 320) throw new Error('SEGMENTATION_SHAPE_INVALID');
  let min = Infinity,
    max = -Infinity;
  for (const n of values) {
    if (!Number.isFinite(n) || n < -0.001 || n > 1.001)
      throw new Error('SEGMENTATION_MASK_INVALID');
    min = Math.min(min, n);
    max = Math.max(max, n);
  }
  if (max - min < 0.01) throw new Error('SEGMENTATION_FLAT_KEEP_ORIGINAL');
  return { min, max };
}

// Model normalization follows upstream rembg U2Net. Letterboxing (rather than the
// upstream square stretch) is an explicit, versioned variation; original RGB is
// never taken from the tensor. Only the inverse-mapped mask is used for alpha.
export async function segmentCodec(
  input: SegmentInput,
  predict: (tensor: Float32Array) => Promise<Prediction>,
): Promise<SegmentOutput> {
  const start = performance.now(),
    cpu = process.cpuUsage();
  sharp.cache(false);
  sharp.concurrency(1);
  if (!Buffer.isBuffer(input.bytes) || input.bytes.length > 12 * 1024 * 1024)
    throw new Error('IMAGE_TOO_LARGE');
  const source = sharp(input.bytes, {
    limitInputPixels: 12_000_000,
    failOn: 'warning',
    animated: false,
  });
  const meta = await source.metadata();
  if (
    !['jpeg', 'png', 'webp'].includes(meta.format ?? '') ||
    (meta.pages ?? 1) !== 1 ||
    !meta.width ||
    !meta.height ||
    meta.width > 8192 ||
    meta.height > 8192
  )
    throw new Error('IMAGE_FORMAT_INVALID');
  const { data: original, info } = await source
    .autoOrient()
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (input.region) validateForegroundRegion(input.region);
  const region = input.region
    ? {
        left: Math.floor(input.region.x * info.width),
        top: Math.floor(input.region.y * info.height),
        width: Math.max(
          1,
          Math.min(
            info.width - Math.floor(input.region.x * info.width),
            Math.round(input.region.width * info.width),
          ),
        ),
        height: Math.max(
          1,
          Math.min(
            info.height - Math.floor(input.region.y * info.height),
            Math.round(input.region.height * info.height),
          ),
        ),
      }
    : { left: 0, top: 0, width: info.width, height: info.height };
  const scale = 320 / Math.max(region.width, region.height);
  const width = Math.max(1, Math.round(region.width * scale)),
    height = Math.max(1, Math.round(region.height * scale));
  const left = Math.floor((320 - width) / 2),
    top = Math.floor((320 - height) / 2);
  const rgb = await sharp(original, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract(region)
    .flatten({ background: '#ffffff' })
    .resize(width, height, { kernel: 'lanczos3', fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
  let maxRgb = 1;
  for (const n of rgb) maxRgb = Math.max(maxRgb, n);
  const tensor = new Float32Array(3 * 320 * 320),
    mean = [0.485, 0.456, 0.406],
    std = [0.229, 0.224, 0.225];
  // Padding is zero in normalized space (channel mean), not stretched product.
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 3; c++)
        tensor[c * 320 * 320 + (top + y) * 320 + left + x] =
          (rgb[(y * width + x) * 3 + c] / maxRgb - mean[c]) / std[c];
  const prediction = await predict(tensor),
    { min, max } = validateProbabilities(prediction.probabilities);
  const small = Buffer.alloc(320 * 320);
  for (let p = 0; p < small.length; p++)
    small[p] = Math.round((255 * (prediction.probabilities[p] - min)) / (max - min));
  const regionMask = await sharp(small, { raw: { width: 320, height: 320, channels: 1 } })
    .extract({ left, top, width, height })
    .resize(region.width, region.height, { kernel: 'lanczos3', fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();
  if (regionMask.length !== region.width * region.height)
    throw new Error('SEGMENTATION_ALIGNMENT_INVALID');
  const mapped = Buffer.alloc(info.width * info.height);
  for (let y = 0; y < region.height; y++)
    regionMask.copy(
      mapped,
      (region.top + y) * info.width + region.left,
      y * region.width,
      (y + 1) * region.width,
    );
  let foreground = 0,
    uncertain = 0,
    boundary = 0;
  let x0 = info.width,
    y0 = info.height,
    x1 = -1,
    y1 = -1;
  const mask = Buffer.alloc(info.width * info.height);
  for (let p = 0; p < mask.length; p++) {
    // Snap confident interior/exterior only; no erosion, hole filling or blur.
    const a = mapped[p] >= 245 ? 255 : mapped[p] <= 10 ? 0 : mapped[p];
    mask[p] = Math.round((a * original[p * 4 + 3]) / 255);
    if (a > 10 && a < 245) uncertain++;
    if (a > 127) {
      foreground++;
      const x = p % info.width,
        y = Math.floor(p / info.width);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      if (!x || !y || x === info.width - 1 || y === info.height - 1) boundary++;
    }
  }
  const area = foreground / mask.length;
  // Broad degeneracy guards, NOT calibrated product-accuracy guarantees.
  if (area < 0.005 || area > 0.97 || x1 < x0) throw new Error('SEGMENTATION_AREA_KEEP_ORIGINAL');
  const warnings = [
    'HUMAN_REVIEW_REQUIRED',
    'REVIEW_LABEL_SHAPE_AND_ATTACHED_OBJECTS',
    'SINGLE_EXAMPLE_MODEL_NOT_BROADLY_VALIDATED',
  ];
  // Detect separated salient regions without deleting any (a multipack/accessory
  // may legitimately be disconnected). This is a review signal, not correctness.
  const seen = new Uint8Array(small.length),
    queue = new Uint32Array(small.length),
    components: number[] = [];
  const eligible = (p: number) =>
    p % 320 >= left &&
    p % 320 < left + width &&
    Math.floor(p / 320) >= top &&
    Math.floor(p / 320) < top + height &&
    small[p] >= 128;
  for (let p = 0; p < small.length; p++)
    if (!seen[p] && eligible(p)) {
      let head = 0,
        tail = 0;
      seen[p] = 1;
      queue[tail++] = p;
      while (head < tail) {
        const q = queue[head++],
          x = q % 320;
        for (const n of [
          x ? q - 1 : -1,
          x < 319 ? q + 1 : -1,
          q >= 320 ? q - 320 : -1,
          q < small.length - 320 ? q + 320 : -1,
        ])
          if (n >= 0 && !seen[n] && eligible(n)) {
            seen[n] = 1;
            queue[tail++] = n;
          }
      }
      if (tail >= 8) components.push(tail);
    }
  if (components.length > 1) warnings.push('MULTIPLE_FOREGROUND_REGIONS_REVIEW_ACCESSORIES');
  if (uncertain / mask.length > 0.35 || area > 0.8)
    warnings.push('MASK_AMBIGUOUS_KEEP_OR_RECAPTURE');
  if (input.region) warnings.push('EMPLOYEE_REGION_GUIDED_REVIEW_ALL_PARTS');
  if (boundary) warnings.push('SOURCE_BOUNDARY_PRODUCT_MAY_ALREADY_BE_CLIPPED');
  if (uncertain / mask.length > 0.08) warnings.push('UNCERTAIN_EDGES_TRANSPARENCY_REVIEW');
  // Preserve every nonzero alpha including soft edges; crop only zero alpha.
  let bx0 = info.width,
    by0 = info.height,
    bx1 = -1,
    by1 = -1;
  for (let p = 0; p < mask.length; p++)
    if (mask[p]) {
      const x = p % info.width,
        y = Math.floor(p / info.width);
      bx0 = Math.min(bx0, x);
      bx1 = Math.max(bx1, x);
      by0 = Math.min(by0, y);
      by1 = Math.max(by1, y);
    }
  const rgba = Buffer.from(original);
  for (let p = 0; p < mask.length; p++) rgba[p * 4 + 3] = mask[p];
  // Retain the inverse-mapped RAW probability image separately from the snapped alpha.
  const maskPng = await sharp(mapped, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .png()
    .toBuffer();
  const cutout = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: bx0, top: by0, width: bx1 - bx0 + 1, height: by1 - by0 + 1 })
    .resize(880, 880, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  const layer = await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: '#00000000' },
  })
    .composite([
      {
        input: cutout.data,
        left: Math.floor((1024 - cutout.info.width) / 2),
        top: Math.floor((1024 - cutout.info.height) / 2),
      },
    ])
    .png()
    .toBuffer();
  const png = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background: input.background === 'LIGHT_GRAY' ? '#f3f3f3' : '#ffffff',
    },
  })
    .composite([{ input: layer }])
    .png()
    .toBuffer();
  const used = process.cpuUsage(cpu);
  return {
    png,
    mask: maskPng,
    foreground: layer,
    warnings,
    metrics: {
      elapsedMs: Math.round(performance.now() - start),
      cpuMicros: used.user + used.system,
      rssBytes: process.memoryUsage().rss,
      inputBytes: input.bytes.length,
      outputBytes: png.length,
      maskKind: 'NEURAL_U2NET',
    },
    details: {
      recipe: SEGMENTATION_RECIPE,
      sourceWidth: info.width,
      sourceHeight: info.height,
      inferenceWidth: 320,
      inferenceHeight: 320,
      transform: {
        width,
        height,
        left,
        top,
        region,
        employeeGuided: !!input.region,
        inverse: 'extract-padding-resize-region-place-in-original',
      },
      inferenceMs: prediction.inferenceMs,
      maskWidth: info.width,
      maskHeight: info.height,
      foregroundFraction: area,
      salientComponentsAt320: components.length,
      uncertainFraction: uncertain / mask.length,
      sourceBoundaryPixels: boundary,
      crop: { left: bx0, top: by0, width: bx1 - bx0 + 1, height: by1 - by0 + 1 },
      rgbPolicy: 'original-srgb-only; alpha-only-before-lossless-resize',
      quality: 'REQUIRES_REVIEW',
      maskStored: 'raw-minmax-normalized-inverse-mapped; alpha-snap<=10-to0-and>=245-to255',
      thresholds: 'broad-degeneracy-guards-not-real-product-accuracy-calibration',
    },
  };
}
