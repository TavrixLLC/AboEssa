import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { StorageProvider } from 'src/files/storage-provider.interface';
import { inspectImage } from 'src/image-optimization/image-codec';
import { MAX_IMAGE_BYTES, DEFAULT_IMAGE_PIXELS } from 'src/image-optimization/image-recipe';

export async function recognitionImage(
  storage: StorageProvider,
  key: string,
  mime: string,
  expectedHash: string,
) {
  if (!/^products\/intake-[a-f0-9]{64}\.(jpg|png|webp)$/.test(key))
    throw new Error('AI_PRIVATE_SOURCE_REQUIRED');
  const object = await storage.getObject(key);
  const chunks: Buffer[] = [];
  let bytes = 0;
  const timer = setTimeout(() => object.stream.destroy(new Error('AI_IMAGE_TIMEOUT')), 15000);
  try {
    if (object.size > MAX_IMAGE_BYTES) throw new Error('AI_IMAGE_TOO_LARGE');
    for await (const chunk of object.stream as AsyncIterable<unknown>) {
      if (!(chunk instanceof Uint8Array)) throw new Error('AI_IMAGE_SOURCE_INVALID');
      bytes += chunk.byteLength;
      if (bytes > MAX_IMAGE_BYTES) throw new Error('AI_IMAGE_TOO_LARGE');
      chunks.push(Buffer.from(chunk));
    }
    if (bytes !== object.size) throw new Error('AI_IMAGE_INCOMPLETE');
    const source = Buffer.concat(chunks);
    if (createHash('sha256').update(mime).update(source).digest('hex') !== expectedHash)
      throw new Error('AI_IMAGE_HASH_MISMATCH');
    await inspectImage(source, mime, DEFAULT_IMAGE_PIXELS, false);
    const result = await sharp(source, {
      limitInputPixels: DEFAULT_IMAGE_PIXELS,
      failOn: 'warning',
    })
      .timeout({ seconds: 12 })
      .autoOrient()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .toColourspace('srgb')
      .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
      .toBuffer();
    if (result.length > 4 * 1024 * 1024) throw new Error('AI_IMAGE_TOO_LARGE');
    return result;
  } finally {
    clearTimeout(timer);
    object.stream.destroy();
  }
}
