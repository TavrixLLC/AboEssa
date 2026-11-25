import sharp from 'sharp';
import type { CodecInput, CodecOutput } from './enhancement-codec';
import { studioHash, StudioProfile, CATALOG_STUDIO_V1 } from './brand-studio.config';
import { tabletopNativeCodec } from './tabletop-native-codec';

export async function studioCodec(input: CodecInput): Promise<CodecOutput> {
  if (input.studioProfile?.placementRecipe === 'rezona-tabletop-native-grounding-v2')
    return tabletopNativeCodec(input);
  sharp.cache(false);
  sharp.concurrency(1);
  const start = performance.now(),
    cpu = process.cpuUsage(),
    p = input.studioProfile!;
  if (
    !input.mask ||
    !p ||
    input.bytes.length > 12 * 1024 * 1024 ||
    input.mask.length > 12 * 1024 * 1024
  )
    throw new Error('STUDIO_MASK_REQUIRED');
  const src = sharp(input.bytes, { limitInputPixels: 12000000, failOn: 'warning' }).timeout({
    seconds: 12,
  });
  const meta = await src.metadata();
  if (
    !['jpeg', 'png', 'webp'].includes(meta.format ?? '') ||
    (meta.pages ?? 1) !== 1 ||
    !meta.width ||
    !meta.height ||
    meta.width > 8192 ||
    meta.height > 8192
  )
    throw new Error('IMAGE_FORMAT_INVALID');
  const { data, info } = await src
    .autoOrient()
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const m = await sharp(input.mask, { limitInputPixels: 12000000, failOn: 'warning' })
    .timeout({ seconds: 12 })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (m.info.width !== info.width || m.info.height !== info.height)
    throw new Error('STUDIO_MASK_ALIGNMENT_INVALID');
  let left = info.width,
    top = info.height,
    right = -1,
    bottom = -1,
    solid = 0;
  for (let n = 0; n < m.data.length; n++) {
    const a = m.data[n] >= 245 ? 255 : m.data[n] <= 10 ? 0 : m.data[n];
    data[n * 4 + 3] = Math.round((a * data[n * 4 + 3]) / 255);
    if (data[n * 4 + 3]) {
      const x = n % info.width,
        y = Math.floor(n / info.width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    if (data[n * 4 + 3] > 127) solid++;
  }
  if (right < left || solid / m.data.length < 0.005 || solid / m.data.length > 0.97)
    throw new Error('STUDIO_MASK_UNSAFE');
  const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const cut = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(crop)
    .resize(1024 - 2 * p.margin, 1024 - 2 * p.margin, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  const x = Math.floor((1024 - cut.info.width) / 2),
    y = Math.floor((1024 - cut.info.height) / 2);
  const foreground = await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: '#00000000' },
  })
    .composite([{ input: cut.data, left: x, top: y }])
    .png()
    .toBuffer();
  const plate =
    input.generated ??
    (await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: p.sceneGate ? '#F8F6F1' : p.backgroundPalette[0],
      },
    })
      .png()
      .toBuffer());
  await validateStudioPlate(plate, !input.generated && p.sceneGate ? CATALOG_STUDIO_V1 : p);
  // Shadow is a locally authored, low-opacity contact ellipse. It never alters source RGB.
  const shadow = Buffer.from(
    `<svg width="1024" height="1024"><defs><filter id="s"><feGaussianBlur stdDeviation="7"/></filter></defs><ellipse filter="url(#s)" cx="512" cy="${y + cut.info.height - 1}" rx="${Math.max(4, cut.info.width * 0.36)}" ry="10" fill="black" opacity="${p.shadowIntensity}"/></svg>`,
  );
  const png = await sharp(plate)
    .composite([{ input: shadow }, { input: foreground }])
    .png()
    .toBuffer();
  const used = process.cpuUsage(cpu);
  return {
    png,
    foreground,
    providerInput: await sharp(foreground).flatten({ background: '#FFFFFF' }).png().toBuffer(),
    warnings: [
      'HUMAN_REVIEW_REQUIRED',
      'GENERATED_BACKGROUND_ONLY_CAPTURED_FOREGROUND_RECOMPOSITED',
      ...(!p.approved ? ['STUDIO_STYLE_PROVISIONAL_REVIEW'] : []),
      'REVIEW_LABEL_SHAPE_AND_ATTACHED_OBJECTS',
      ...(p.sceneGate
        ? ['TABLETOP_SCENE_SEMANTIC_REVIEW_REQUIRED', 'COMPARE_LOCAL_MEANINGFUL_VALUE_REQUIRED']
        : []),
    ],
    details: {
      crop,
      sourceWidth: info.width,
      sourceHeight: info.height,
      maskHash: studioHash(input.mask),
      foregroundHash: studioHash(foreground),
      plateHash: studioHash(plate),
      styleHash: studioHash(JSON.stringify(p)),
      rgbPolicy:
        'original-srgb-only; Phase7.1 alpha-snap; lossless resampling; no generative foreground',
      plateGate: p.sceneGate
        ? 'tabletop-v1 structural bounds; mandatory human no-objects/value review; not semantic proof'
        : 'strict neutral low-frequency heuristic; not semantic proof',
    },
    metrics: {
      elapsedMs: Math.round(performance.now() - start),
      cpuMicros: used.user + used.system,
      rssBytes: process.memoryUsage().rss,
      inputBytes: input.bytes.length,
      outputBytes: png.length,
      maskKind: 'APPROVED_PHASE71_MASK',
    },
  };
}
export async function validateStudioPlate(bytes: Buffer, p: StudioProfile) {
  if (bytes.length > 12 * 1024 * 1024) throw new Error('STUDIO_PLATE_INVALID');
  const image = sharp(bytes, { limitInputPixels: 1048576, failOn: 'warning' }).timeout({
      seconds: 12,
    }),
    meta = await image.metadata();
  if (
    !['png', 'jpeg', 'webp'].includes(meta.format ?? '') ||
    meta.width !== 1024 ||
    meta.height !== 1024 ||
    (meta.pages ?? 1) !== 1
  )
    throw new Error('STUDIO_PLATE_INVALID');
  if (meta.hasAlpha) {
    const rgba = await image.clone().ensureAlpha().raw().toBuffer();
    for (let i = 3; i < rgba.length; i += 4)
      if (rgba[i] !== 255) throw new Error('STUDIO_PLATE_INVALID');
  }
  // Check every pixel INCLUDING the central area hidden behind the product. A hidden ghost isn't safe.
  const { data, info } = await image
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const base = p.backgroundPalette.map((c) =>
    [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)),
  );
  if (p.sceneGate === 'tabletop-v1') {
    // Explicit separate recipe for owner-authorized tabletop QA; NEVER replaces the
    // legacy neutral gate. Texture/planes are permitted, not semantically certified.
    let sum = 0,
      squared = 0,
      bad = 0,
      edges = 0;
    const pixels = info.width * info.height;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 3,
          rgb = [data[i], data[i + 1], data[i + 2]],
          l = (rgb[0] + rgb[1] + rgb[2]) / 3;
        sum += l;
        squared += l * l;
        if (Math.min(...rgb) < 45 || Math.max(...rgb) - Math.min(...rgb) > 110) bad++;
        if (x && Math.max(...rgb.map((v, k) => Math.abs(v - data[i - 3 + k]))) > 32) edges++;
        if (y && Math.max(...rgb.map((v, k) => Math.abs(v - data[i - 3072 + k]))) > 32) edges++;
      }
    if (bad / pixels > 0.08 || edges / pixels > 0.07)
      throw Error('STUDIO_SCENE_CLUTTER_OR_COLOR_REJECTED');
    if (Math.sqrt(Math.max(0, squared / pixels - (sum / pixels) ** 2)) < 2)
      throw Error('STUDIO_NO_MEANINGFUL_SCENE_KEEP_LOCAL');
    return; // All surviving scenes still require explicit semantic AND value review.
  }
  let edges = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3,
        rgb = [data[i], data[i + 1], data[i + 2]];
      if (
        Math.min(...rgb) < 220 ||
        Math.max(...rgb) - Math.min(...rgb) > (p.accentsEnabled ? 35 : 18) ||
        Math.min(...base.map((b) => Math.max(...rgb.map((v, k) => Math.abs(v - b[k]))))) > 28
      )
        throw new Error('STUDIO_PLATE_GHOST_OR_OBJECT_REJECTED');
      if (x && Math.max(...rgb.map((v, k) => Math.abs(v - data[i - 3 + k]))) > 4) edges++;
      if (y && Math.max(...rgb.map((v, k) => Math.abs(v - data[i - 3072 + k]))) > 4) edges++;
    }
  if (edges > 128) throw new Error('STUDIO_PLATE_GHOST_OR_OBJECT_REJECTED');
}
