import sharp, { Sharp } from 'sharp';
import { DEFAULT_IMAGE_PIXELS, MAX_IMAGE_BYTES, MAX_IMAGE_EDGE } from './image-recipe';

export const IMAGE_FORMAT_MIME = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

export class ImageInputError extends Error {
  constructor(readonly code: 'INVALID_IMAGE' | 'IMAGE_TOO_LARGE' | 'UNSUPPORTED_IMAGE_TYPE') {
    super(code);
  }
}

const sizes = [
  ['PLACEHOLDER', 40, 2_500, 64, 48],
  ['THUMBNAIL', 240, 25_000, 82, 70],
  ['CATALOG', 480, 60_000, 85, 74],
  ['DETAIL', 1024, 250_000, 88, 78],
] as const;
export type EncodedVariant = {
  variantType: (typeof sizes)[number][0];
  format: 'WEBP' | 'JPEG';
  extension: 'webp' | 'jpg';
  width: number;
  height: number;
  body: Buffer;
};

function decoder(body: Buffer, maxPixels: number) {
  return sharp(body, { failOn: 'warning', limitInputPixels: maxPixels }).timeout({ seconds: 12 });
}

export async function inspectImage(
  body: Buffer,
  mime: string,
  maxPixels = DEFAULT_IMAGE_PIXELS,
  fullDecode = true,
) {
  if (body.length > MAX_IMAGE_BYTES) throw new ImageInputError('IMAGE_TOO_LARGE');
  // Check the container before giving data to libvips (no SVG, TIFF, PDF, etc.).
  const signatureMime =
    body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
      ? IMAGE_FORMAT_MIME.jpeg
      : body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        ? IMAGE_FORMAT_MIME.png
        : body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP'
          ? IMAGE_FORMAT_MIME.webp
          : undefined;
  if (!signatureMime || mime !== signatureMime) {
    throw new ImageInputError('UNSUPPORTED_IMAGE_TYPE');
  }
  try {
    const source = decoder(body, maxPixels);
    const info = await source.metadata();
    if (IMAGE_FORMAT_MIME[info.format as keyof typeof IMAGE_FORMAT_MIME] !== mime)
      throw new ImageInputError('UNSUPPORTED_IMAGE_TYPE');
    if ((info.pages ?? 1) !== 1 || !info.width || !info.height)
      throw new ImageInputError('INVALID_IMAGE');
    if (
      info.width > MAX_IMAGE_EDGE ||
      info.height > MAX_IMAGE_EDGE ||
      info.width * info.height > maxPixels
    )
      throw new ImageInputError('IMAGE_TOO_LARGE');
    // Metadata alone accepts many truncated files; stats forces a bounded decode.
    if (fullDecode) await source.stats();
    return info;
  } catch (error) {
    if (error instanceof ImageInputError) throw error;
    if (error instanceof Error && /pixel limit/i.test(error.message))
      throw new ImageInputError('IMAGE_TOO_LARGE');
    throw new ImageInputError('INVALID_IMAGE');
  }
}

export async function* encodeVariants(
  body: Buffer,
  mime: string,
  maxPixels = DEFAULT_IMAGE_PIXELS,
) {
  await inspectImage(body, mime, maxPixels, false);
  for (const [variantType, edge, budget, high, floor] of sizes) {
    const raster = await decoder(body, maxPixels)
      .autoOrient()
      .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = raster.info;
    const pixels = () =>
      sharp(raster.data, { raw: { width, height, channels } }).timeout({ seconds: 12 });
    const webp = await fitBudget(
      (q) => pixels().webp({ quality: q, effort: 4 }),
      high,
      floor,
      budget,
    );
    yield { variantType, format: 'WEBP', extension: 'webp', width, height, body: webp } as const;
    // Explicit URLs avoid edge content-negotiation mixing. JPEG flattens alpha onto white.
    const jpeg = await fitBudget(
      (q) =>
        pixels()
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: q, mozjpeg: true, chromaSubsampling: '4:4:4' }),
      high,
      floor,
      budget,
    );
    yield { variantType, format: 'JPEG', extension: 'jpg', width, height, body: jpeg } as const;
  }
}

async function fitBudget(
  encode: (quality: number) => Sharp,
  high: number,
  floor: number,
  budget: number,
) {
  // A floor protects text and fine details. The byte budget is advisory.
  let quality = high;
  for (;;) {
    const bytes = await encode(quality).toBuffer();
    if (bytes.length <= budget || quality === floor) return bytes;
    quality = Math.max(floor, quality - 5);
  }
}
