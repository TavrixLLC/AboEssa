import sharp from 'sharp';
import { encodeVariants, inspectImage } from 'src/image-optimization/image-codec';

async function collect(body: Buffer, mime: string) {
  const results = [];
  for await (const variant of encodeVariants(body, mime)) results.push(variant);
  return results;
}

describe('catalog image recipe', () => {
  it('produces real WebP and JPEG without upscaling or changing the original', async () => {
    const original = await sharp({
      create: { width: 120, height: 80, channels: 4, background: '#ffaa4480' },
    })
      .png()
      .toBuffer();
    const copy = Buffer.from(original);
    const variants = await collect(original, 'image/png');
    expect(original.equals(copy)).toBe(true);
    expect(variants).toHaveLength(8);
    for (const v of variants) {
      const encoded = await sharp(v.body).metadata();
      expect(encoded.format).toEqual(v.format.toLowerCase());
      expect([encoded.width, encoded.height]).toEqual([v.width, v.height]);
      expect(v.width).toBe(v.variantType === 'PLACEHOLDER' ? 40 : 120);
      expect(encoded.hasAlpha).toBe(v.format === 'WEBP');
      expect(encoded.exif).toBeUndefined();
    }
  });

  it('applies EXIF orientation to generated variants and removes the metadata', async () => {
    const source = await sharp({
      create: { width: 120, height: 80, channels: 3, background: '#225588' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const variants = await collect(source, 'image/jpeg');
    const detail = variants.find((v) => v.variantType === 'DETAIL')!;
    expect([detail.width, detail.height]).toEqual([80, 120]);
    expect((await sharp(detail.body).metadata()).orientation).toBeUndefined();
    expect((await inspectImage(source, 'image/jpeg')).orientation).toBe(6);
  });

  it('rejects corrupt, misleading and oversized input', async () => {
    const source = await sharp({
      create: { width: 600, height: 600, channels: 3, background: '#336688' },
    })
      .png()
      .toBuffer();
    await expect(inspectImage(source, 'image/jpeg')).rejects.toMatchObject({
      code: 'UNSUPPORTED_IMAGE_TYPE',
    });
    await expect(inspectImage(source.subarray(0, 48), 'image/png')).rejects.toMatchObject({
      code: 'INVALID_IMAGE',
    });
    await expect(inspectImage(source, 'image/png', 100_000)).rejects.toMatchObject({
      code: 'IMAGE_TOO_LARGE',
    });
    await expect(inspectImage(Buffer.alloc(13 * 1024 * 1024), 'image/png')).rejects.toMatchObject({
      code: 'IMAGE_TOO_LARGE',
    });
  });
});
