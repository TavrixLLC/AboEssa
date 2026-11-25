import sharp from 'sharp';
import { studioCodec } from './brand-studio-codec';
import { premium3dCodec } from './premium-3d-codec';
import { studioLibraryCodec } from './studio-library-codec';
import type { StudioProfile } from './brand-studio.config';
export type CodecInput = {
  bytes: Buffer;
  mime: string;
  mode: string;
  matting: boolean;
  background: string;
  generated?: Buffer;
  foreground?: Buffer;
  mask?: Buffer;
  originalReference?: boolean;
  studioProfile?: StudioProfile;
  placement?: import('./tabletop-placement').TabletopPlacement;
};
export type CodecOutput = {
  png: Buffer;
  foreground?: Buffer;
  providerInput?: Buffer;
  details?: Record<string, unknown>;
  warnings: string[];
  metrics: {
    elapsedMs: number;
    cpuMicros: number;
    rssBytes: number;
    inputBytes: number;
    outputBytes: number;
    maskKind: string;
  };
};
const LIMIT = 12_000_000;
// This module runs in a disposable process; no global Sharp cache changes in the API.
export async function enhanceCodec(input: CodecInput): Promise<CodecOutput> {
  if (['PRODUCT_STUDIO_FAITHFUL', 'PRODUCT_STUDIO_HERO'].includes(input.mode))
    return studioLibraryCodec(input);
  if (input.mode === 'PREMIUM_3D_STUDIO') return premium3dCodec(input);
  if (input.mode === 'GEMINI_BRAND_STUDIO') return studioCodec(input);
  const start = performance.now(),
    cpu = process.cpuUsage();
  sharp.cache(false);
  sharp.concurrency(1);
  if (input.bytes.length > 12 * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE');
  const image = sharp(input.bytes, {
    limitInputPixels: LIMIT,
    failOn: 'warning',
    animated: false,
  }).timeout({ seconds: 12 });
  const meta = await image.metadata();
  if (
    !['jpeg', 'png', 'webp'].includes(meta.format ?? '') ||
    (meta.pages ?? 1) !== 1 ||
    !meta.width ||
    !meta.height ||
    meta.width > 8192 ||
    meta.height > 8192
  )
    throw new Error('IMAGE_FORMAT_INVALID');
  const { data, info } = await image
    .autoOrient()
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const warnings = ['HUMAN_REVIEW_REQUIRED'];
  if (Math.max(info.width, info.height) > 1024)
    warnings.push('DOWNSCALED_REVIEW_FINE_PRINT_ON_ORIGINAL');
  let maskKind = 'NONE';
  const needMask = input.mode !== 'CLEAN';
  if (needMask) {
    let transparent = 0,
      solid = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 8) transparent++;
      if (data[i] > 247) solid++;
    }
    if (transparent > info.width * info.height * 0.05 && solid > info.width * info.height * 0.02) {
      maskKind = 'SOURCE_ALPHA';
      warnings.push('ALPHA_EDGES_REQUIRE_REVIEW');
    } else if (input.matting) {
      // Conservative border-connected WHITE matte, not neural segmentation. It never selects a single object.
      const w = info.width,
        h = info.height,
        count = w * h;
      const near = (p: number) => {
        const i = p * 4;
        return (
          data[i] >= 247 &&
          data[i + 1] >= 247 &&
          data[i + 2] >= 247 &&
          Math.max(data[i], data[i + 1], data[i + 2]) -
            Math.min(data[i], data[i + 1], data[i + 2]) <=
            4
        );
      };
      let edge = 0,
        valid = 0;
      for (let x = 0; x < w; x++)
        for (const p of [x, (h - 1) * w + x]) {
          edge++;
          if (near(p)) valid++;
        }
      for (let y = 1; y < h - 1; y++)
        for (const p of [y * w, y * w + w - 1]) {
          edge++;
          if (near(p)) valid++;
        }
      if (valid / edge < 0.995) throw new Error('MASK_UNSAFE_KEEP_ORIGINAL');
      const seen = new Uint8Array(count),
        queue = new Uint32Array(count);
      let head = 0,
        tail = 0;
      const add = (p: number) => {
        if (!seen[p] && near(p)) {
          seen[p] = 1;
          queue[tail++] = p;
        }
      };
      for (let x = 0; x < w; x++) {
        add(x);
        add((h - 1) * w + x);
      }
      for (let y = 0; y < h; y++) {
        add(y * w);
        add(y * w + w - 1);
      }
      while (head < tail) {
        const p = queue[head++],
          x = p % w;
        if (x) add(p - 1);
        if (x < w - 1) add(p + 1);
        if (p >= w) add(p - w);
        if (p + w < count) add(p + w);
      }
      if (tail < count * 0.15 || tail > count * 0.92) throw new Error('MASK_UNSAFE_KEEP_ORIGINAL');
      let contrast = 0;
      for (let p = 0; p < count; p++) {
        if (seen[p]) data[p * 4 + 3] = 0;
        else if (Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) < 210) contrast++;
      }
      if (contrast < (count - tail) * 0.2) throw new Error('MASK_LOW_CONTRAST_KEEP_ORIGINAL');
      maskKind = 'CONSERVATIVE_WHITE_BORDER';
      warnings.push(
        'LIMITED_WHITE_BORDER_MATTE_NOT_NEURAL',
        'REVIEW_WHITE_REFLECTIVE_TRANSPARENT_THIN_PARTS',
      );
    } else throw new Error('SEGMENTATION_UNAVAILABLE_KEEP_ORIGINAL');
  }
  const resized = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
    limitInputPixels: LIMIT,
  })
    .resize(880, 880, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  const foreground = await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: '#00000000' },
  })
    .composite([
      {
        input: resized.data,
        left: Math.floor((1024 - resized.info.width) / 2),
        top: Math.floor((1024 - resized.info.height) / 2),
      },
    ])
    .png()
    .toBuffer();
  const bg = input.background === 'LIGHT_GRAY' ? '#f3f3f3' : '#ffffff';
  let background: Buffer | undefined;
  if (input.generated) {
    if (input.generated.length > 12 * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE');
    const generatedMeta = await sharp(input.generated, {
      limitInputPixels: LIMIT,
      failOn: 'warning',
    }).metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(generatedMeta.format ?? '') ||
      (generatedMeta.pages ?? 1) !== 1
    )
      throw new Error('IMAGE_PROVIDER_FORMAT_INVALID');
    // Generated product pixels are NEVER accepted. Only a near-neutral background can survive this gate.
    const generated = await sharp(input.generated, { limitInputPixels: LIMIT, failOn: 'warning' })
      .timeout({ seconds: 12 })
      .resize(1024, 1024, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer();
    const mask = await sharp(foreground).raw().toBuffer();
    let outside = 0,
      unsafe = 0;
    for (let p = 0; p < 1024 * 1024; p++)
      if (mask[p * 4 + 3] < 8) {
        outside++;
        if (
          Math.min(generated[p * 3], generated[p * 3 + 1], generated[p * 3 + 2]) < 225 ||
          Math.max(generated[p * 3], generated[p * 3 + 1], generated[p * 3 + 2]) -
            Math.min(generated[p * 3], generated[p * 3 + 1], generated[p * 3 + 2]) >
            12
        )
          unsafe++;
      }
    if (!outside || unsafe / outside > 0.01)
      throw new Error('GENERATED_BACKGROUND_UNSAFE_KEEP_ORIGINAL');
    background = await sharp(generated, { raw: { width: 1024, height: 1024, channels: 3 } })
      .png()
      .toBuffer();
    warnings.push('GENERATED_BACKGROUND_ONLY_CAPTURED_FOREGROUND_RECOMPOSITED');
  }
  const canvas = background
    ? sharp(background)
    : sharp({ create: { width: 1024, height: 1024, channels: 3, background: bg } });
  const png = await canvas
    .composite([{ input: foreground }])
    .png()
    .toBuffer();
  const outputStats = await sharp(png).stats();
  if (outputStats.channels.slice(0, 3).every((c) => c.max - c.min < 3))
    throw new Error('IMAGE_EMPTY_KEEP_ORIGINAL');
  const used = process.cpuUsage(cpu);
  return {
    png,
    ...(needMask
      ? {
          foreground,
          providerInput: await sharp(input.bytes, { limitInputPixels: LIMIT })
            .autoOrient()
            .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: 90 })
            .toBuffer(),
        }
      : {}),
    warnings,
    metrics: {
      elapsedMs: Math.round(performance.now() - start),
      cpuMicros: used.user + used.system,
      rssBytes: process.memoryUsage().rss,
      inputBytes: input.bytes.length,
      outputBytes: png.length,
      maskKind,
    },
  };
}
