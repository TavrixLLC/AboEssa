import sharp from 'sharp';
import { createHash } from 'node:crypto';
import type { CodecInput, CodecOutput } from './enhancement-codec';
import { studioCodec } from './brand-studio-codec';
import { CATALOG_STUDIO_V1 } from './brand-studio.config';
import { PREMIUM_3D_STYLE, PREMIUM_3D_RECIPE } from './premium-3d.config';
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
export async function premium3dCodec(input: CodecInput): Promise<CodecOutput> {
  if (input.studioProfile?.name !== PREMIUM_3D_STYLE || !input.mask)
    throw Error('PREMIUM_3D_SOURCE_REQUIRED');
  // Reference preparation uses the reviewed real foreground. This is NOT the final generative image.
  const reference = await studioCodec({
    ...input,
    mode: 'GEMINI_BRAND_STUDIO',
    generated: undefined,
    studioProfile: CATALOG_STUDIO_V1,
  });
  if (!input.generated)
    return {
      ...reference,
      warnings: ['PREMIUM_3D_REFERENCE_ONLY_NOT_RESULT'],
      details: { ...reference.details, renderPolicy: 'REFERENCE_ONLY', recipe: PREMIUM_3D_RECIPE },
    };
  const started = performance.now(),
    cpu = process.cpuUsage();
  if (input.generated.length > 12 * 1024 * 1024) throw Error('PREMIUM_3D_OUTPUT_TOO_LARGE');
  const im = sharp(input.generated, { limitInputPixels: 1048576, failOn: 'warning' }).timeout({
      seconds: 12,
    }),
    meta = await im.metadata();
  if (
    !['png', 'jpeg', 'webp'].includes(meta.format ?? '') ||
    (meta.pages ?? 1) !== 1 ||
    meta.width !== 1024 ||
    meta.height !== 1024
  )
    throw Error('PREMIUM_3D_OUTPUT_INVALID');
  const { data, info } = await im
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let outside = 0,
    dark = 0,
    gold = 0;
  for (let y = 0; y < 1024; y++)
    for (let x = 0; x < 1024; x++) {
      const i = (y * 1024 + x) * 4;
      if (data[i + 3] !== 255) throw Error('PREMIUM_3D_ALPHA_INVALID');
      if (x < 154 || x > 869 || y < 154 || y > 869) {
        outside++;
        if (Math.max(data[i], data[i + 1], data[i + 2]) < 86) dark++;
        if (
          data[i] > 110 &&
          data[i + 1] > 70 &&
          data[i + 1] < data[i] * 0.96 &&
          data[i + 2] < data[i + 1] * 0.85
        )
          gold++;
      }
    }
  if (dark / outside < 0.35 || gold / outside < 0.001)
    throw Error('PREMIUM_3D_BLACK_GOLD_THEME_REVIEW_FAILED');
  // Full provider RGB retained after metadata-stripping encode. NO source-foreground overlay.
  const png = await sharp(data, { raw: info }).png().toBuffer(),
    used = process.cpuUsage(cpu);
  return {
    png,
    warnings: [
      'HUMAN_REVIEW_REQUIRED',
      'GENERATIVE_PRODUCT_NOT_CAPTURED_PIXELS',
      'PREMIUM_3D_STRICT_IDENTITY_REVIEW',
      'PREMIUM_3D_MARKETING_NOT_DOCUMENTARY_PHOTO',
      'COMPARE_LOCAL_MEANINGFUL_VALUE_REQUIRED',
    ],
    details: {
      renderPolicy: 'GENERATIVE_PRODUCT_3D',
      recipe: PREMIUM_3D_RECIPE,
      opaqueRgbPreserved: false,
      sourceMaskHash: hash(input.mask),
      referenceForegroundHash: reference.details?.foregroundHash,
      generatedContentHash: hash(input.generated),
      stylePreset: PREMIUM_3D_STYLE,
      themeMetrics: { darkBorderFraction: dark / outside, goldBorderFraction: gold / outside },
      semanticValidation:
        'NOT_AUTOMATED: logo/text/shape/colors/duplicates/pedestal/quality require strict human review',
    },
    metrics: {
      elapsedMs: Math.round(performance.now() - started),
      cpuMicros: used.user + used.system,
      rssBytes: process.memoryUsage().rss,
      inputBytes: input.bytes.length,
      outputBytes: png.length,
      maskKind: 'APPROVED_MASK_REFERENCE_ONLY_NOT_RECOMPOSITED',
    },
  };
}
