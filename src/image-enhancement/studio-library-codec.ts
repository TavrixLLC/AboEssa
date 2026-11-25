import sharp from 'sharp';
import { createHash } from 'node:crypto';
import type { CodecInput, CodecOutput } from './enhancement-codec';
import { CATALOG_STUDIO_V1 } from './brand-studio.config';
import { studioCodec } from './brand-studio-codec';
import { tabletopNativeCodec } from './tabletop-native-codec';
import { validateStudioPremiumRaster } from './studio-scenes';
export async function studioLibraryCodec(input: CodecInput): Promise<CodecOutput> {
  const p = input.studioProfile;
  if (!p?.templateDefinition || (!input.mask && !input.originalReference))
    throw Error('STUDIO_TEMPLATE_SOURCE_REQUIRED');
  if (input.originalReference && (input.mask || p.processingMode !== 'GENERATIVE_3D_HERO'))
    throw Error('STUDIO_ORIGINAL_REFERENCE_HERO_ONLY');
  if (p.processingMode === 'FAITHFUL_COMPOSITE') return tabletopNativeCodec(input);
  if (p.processingMode !== 'GENERATIVE_3D_HERO') throw Error('STUDIO_MODE_INCOMPATIBLE');
  const reference = input.originalReference
    ? await originalReference(input)
    : await studioCodec({
        ...input,
        studioProfile: CATALOG_STUDIO_V1,
        generated: undefined,
      });
  if (!input.generated)
    return {
      ...reference,
      warnings: ['STUDIO_REFERENCE_ONLY_NOT_RESULT'],
      details: { ...reference.details, mediaRole: 'REFERENCE_ONLY' },
    };
  const started = performance.now(),
    cpu = process.cpuUsage(),
    metrics = await validateStudioPremiumRaster(input.generated, 1024, false);
  const png = await sharp(input.generated, { limitInputPixels: 1048576, failOn: 'warning' })
      .toColourspace('srgb')
      .png()
      .toBuffer(),
    used = process.cpuUsage(cpu);
  return {
    png,
    warnings: [
      'HUMAN_REVIEW_REQUIRED',
      'GENERATIVE_PRODUCT_NOT_CAPTURED_PIXELS',
      'PREMIUM_3D_STRICT_IDENTITY_REVIEW',
      'AI_PROMOTIONAL_SECONDARY_ONLY',
      'MATERIAL_MISMATCH_MUST_REJECT',
      'COMPARE_LOCAL_MEANINGFUL_VALUE_REQUIRED',
    ],
    details: {
      mediaRole: 'AI_PROMOTIONAL',
      renderPolicy: 'GENERATIVE_PRODUCT_3D',
      opaqueRgbPreserved: false,
      referenceKind: input.originalReference ? 'ORIGINAL_REFERENCE' : 'APPROVED_MASK',
      maskHash: input.mask ? createHash('sha256').update(input.mask).digest('hex') : null,
      sourceForegroundHash: reference.details?.foregroundHash,
      generatedHash: createHash('sha256').update(input.generated).digest('hex'),
      themeMetrics: metrics,
    },
    metrics: {
      elapsedMs: Math.round(performance.now() - started),
      cpuMicros: used.user + used.system,
      rssBytes: process.memoryUsage().rss,
      inputBytes: input.bytes.length,
      outputBytes: png.length,
      maskKind: input.originalReference
        ? 'NONE_ORIGINAL_REFERENCE'
        : 'APPROVED_MASK_REFERENCE_ONLY',
    },
  };
}

async function originalReference(input: CodecInput): Promise<CodecOutput> {
  if (input.bytes.length > 12 * 1024 * 1024) throw Error('IMAGE_TOO_LARGE');
  const image = sharp(input.bytes, {
    limitInputPixels: 12000000,
    failOn: 'warning',
    animated: false,
  }).timeout({ seconds: 12 });
  const m = await image.metadata();
  if (
    !['jpeg', 'png', 'webp'].includes(m.format ?? '') ||
    (m.pages ?? 1) !== 1 ||
    !m.width ||
    !m.height ||
    m.width > 8192 ||
    m.height > 8192
  )
    throw Error('IMAGE_FORMAT_INVALID');
  // Resize INSIDE without crop, masking or perspective invention. Original storage is immutable.
  const png = await image
    .autoOrient()
    .toColourspace('srgb')
    .resize(1536, 1536, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  if (png.length > 6 * 1024 * 1024) throw Error('FAL_STUDIO_REFERENCE_TOO_LARGE');
  return {
    png,
    providerInput: png,
    warnings: [
      'ORIGINAL_REFERENCE_NOT_PIXEL_PRESERVATION',
      'PACKAGING_ARTWORK_IS_NOT_THE_PHYSICAL_PRODUCT',
      'SOURCE_INCOMPLETENESS_REQUIRES_REVIEW',
    ],
    details: {
      referenceKind: 'ORIGINAL_REFERENCE',
      referenceHash: createHash('sha256').update(png).digest('hex'),
      opaqueRgbPreserved: false,
      maskHash: null,
    },
    metrics: {
      elapsedMs: 0,
      cpuMicros: 0,
      rssBytes: process.memoryUsage().rss,
      inputBytes: input.bytes.length,
      outputBytes: png.length,
      maskKind: 'NONE_ORIGINAL_REFERENCE',
    },
  };
}
