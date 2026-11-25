// Private QA-only inspection; product photograph stays OUTSIDE the repository.
if (process.env.REZONA_PHASE5_QA !== '1') throw Error('Explicit QA flag required');
const { PrismaClient } = require('@prisma/client');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const fs = require('node:fs');
const crypto = require('node:crypto');
const db = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://phase5_qa:phase5-local-only@127.0.0.1:55446/rezona_phase5_qa' },
  },
});
(async () => {
  try {
    const capture = JSON.parse(
      fs.readFileSync('docs/benchmarks/phase5/device/capture.json', 'utf8'),
    );
    const s = await db.productIntakeSession.findUniqueOrThrow({
      where: { id: capture.observed.serverId },
      include: { createdBy: true, images: { include: { asset: true } } },
    });
    if (s.createdBy.email !== 'phase5-device-qa@example.test') throw Error('Unexpected actor');
    const asset = s.images.find((i) => i.clientImageId === s.selectedImageKey)?.asset;
    if (!asset?.intakePrivate || !asset.key.startsWith('products/intake-'))
      throw Error('Unexpected asset');
    const file = 'D:/rezona-phase5-qa/physical-upload-original.jpg';
    const storage = new S3Client({
      endpoint: 'http://127.0.0.1:59046', region: 'us-east-1', forcePathStyle: true,
      credentials: { accessKeyId: 'phase5-qa', secretAccessKey: 'phase5-local-only' }, maxAttempts: 1,
    });
    try {
      const object = await storage.send(new GetObjectCommand({ Bucket: 'phase5-qa', Key: asset.key }));
      fs.writeFileSync(file, Buffer.from(await object.Body.transformToByteArray()), { flag: 'wx' });
    } finally { storage.destroy(); }
    const bytes = fs.readFileSync(file),
      meta = await sharp(bytes).metadata();
    const result = {
      time: new Date().toISOString(),
      sessionId: s.id,
      assetId: asset.id,
      bytes: bytes.length,
      width: meta.width,
      height: meta.height,
      exifPresent: !!meta.exif,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      privateArtifactOutsideRepository: file,
      visualReview: 'See report; this records file metadata, not a recognition-quality assertion',
    };
    fs.writeFileSync(
      'docs/benchmarks/phase5/device/photo-metadata.json',
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
