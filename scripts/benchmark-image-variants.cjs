const { readdir, readFile, mkdtemp, writeFile } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { performance } = require('node:perf_hooks');
const sharp = require('sharp');
const { encodeVariants } = require('../dist/src/image-optimization/image-codec');

async function main() {
  const fixtures = resolve(__dirname, '../demo-assets/google-play-catalog');
  const review = process.argv.includes('--review')
    ? await mkdtemp(join(tmpdir(), 'rezona-image-review-'))
    : undefined;
  const reports = [];
  for (const filename of (await readdir(fixtures)).sort()) {
    if (!filename.endsWith('.png')) continue;
    const original = await readFile(join(fixtures, filename));
    const started = performance.now();
    const variants = {};
    let total = original.length;
    let catalog;
    for await (const variant of encodeVariants(original, 'image/png')) {
      const name = `${variant.variantType.toLowerCase()}_${variant.format.toLowerCase()}`;
      variants[name] = variant.body.length;
      total += variant.body.length;
      if (name === 'catalog_webp') catalog = variant.body;
    }
    reports.push({
      filename,
      original: original.length,
      ...variants,
      totalStored: total,
      ms: Math.round(performance.now() - started),
    });
    if (review) {
      // Compare both at the actual catalog resolution, not at unequal scaling.
      const reference = await sharp(original).resize(480, 480).png().toBuffer();
      const compressed = await sharp(catalog).png().toBuffer();
      const sheet = await sharp({
        create: { width: 960, height: 480, channels: 3, background: 'white' },
      })
        .composite([
          { input: reference, left: 0, top: 0 },
          { input: compressed, left: 480, top: 0 },
        ])
        .png()
        .toBuffer();
      await writeFile(join(review, filename), sheet, { flag: 'wx' });
      await writeFile(join(review, filename + '.catalog.webp'), catalog, { flag: 'wx' });
    }
  }
  const sums = Object.fromEntries(
    Object.keys(reports[0])
      .filter((key) => key !== 'filename')
      .map((key) => [key, reports.reduce((sum, row) => sum + row[key], 0)]),
  );
  const averages = Object.fromEntries(
    Object.entries(sums).map(([key, value]) => [key, Math.round(value / reports.length)]),
  );
  console.log(
    JSON.stringify(
      {
        sharp: sharp.versions.sharp,
        libvips: sharp.versions.vips,
        review,
        reports,
        averages,
        catalogCompressionRatio: Number((sums.original / sums.catalog_webp).toFixed(2)),
        estimatedStoredDecimalGB: Object.fromEntries(
          [1000, 10000, 100000].map((count) => [
            count,
            Number(((count * sums.totalStored) / reports.length / 1e9).toFixed(3)),
          ]),
        ),
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
