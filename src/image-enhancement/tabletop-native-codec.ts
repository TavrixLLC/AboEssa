import sharp from 'sharp';
import { createHash } from 'node:crypto';
import type { CodecInput, CodecOutput } from './enhancement-codec';
import {
  planTabletopPlacement,
  validateTabletopPlacement,
  type TabletopGeometry,
} from './tabletop-placement';
import { renderLocalTabletop, validateTabletopV2Plate, tabletopMaterial } from './tabletop-scenes';
import { renderStudioPlate, validateStudioPremiumRaster } from './studio-scenes';
const hash = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
async function alphaShadow(
  foreground: Buffer,
  g: TabletopGeometry,
  blur: number,
  dx: number,
  dy: number,
  opacity: number,
) {
  const e = g.canvasEdge,
    alpha = await sharp(foreground).extractChannel('alpha').blur(blur).greyscale().raw().toBuffer(),
    rgba = Buffer.alloc(e * e * 4);
  for (let y = 0; y < e; y++)
    for (let x = 0; x < e; x++)
      if (x + dx >= 0 && x + dx < e && y + dy >= 0 && y + dy < e)
        rgba[((y + dy) * e + x + dx) * 4 + 3] = Math.round(alpha[y * e + x] * opacity);
  return sharp(rgba, { raw: { width: e, height: e, channels: 4 } })
    .png()
    .toBuffer();
}
export async function tabletopNativeCodec(input: CodecInput): Promise<CodecOutput> {
  sharp.cache(false);
  sharp.concurrency(1);
  const started = performance.now(),
    cpu = process.cpuUsage(),
    p = input.studioProfile!,
    placement = validateTabletopPlacement(input.placement);
  const premium = p.sceneGate === 'premium-templates-v1';
  if (premium && !p.templateDefinition) throw Error('STUDIO_TEMPLATE_REQUIRED');
  if (!input.mask || input.bytes.length > 12 * 1024 * 1024 || input.mask.length > 12 * 1024 * 1024)
    throw Error('STUDIO_MASK_REQUIRED');
  const sourceMeta = await sharp(input.bytes, { limitInputPixels: 12000000 }).metadata();
  const maskMeta = await sharp(input.mask, { limitInputPixels: 12000000 }).metadata();
  if (
    !['jpeg', 'png', 'webp'].includes(sourceMeta.format ?? '') ||
    (sourceMeta.pages ?? 1) !== 1 ||
    maskMeta.format !== 'png' ||
    (maskMeta.pages ?? 1) !== 1
  )
    throw Error('TABLETOP_SOURCE_FORMAT_INVALID');
  if (input.generated) {
    const meta = await sharp(input.generated, { limitInputPixels: 1048576 }).metadata();
    if (
      input.generated.length > 12 * 1024 * 1024 ||
      meta.width !== 1024 ||
      meta.height !== 1024 ||
      (meta.pages ?? 1) !== 1 ||
      !['jpeg', 'png', 'webp'].includes(meta.format ?? '')
    )
      throw Error('TABLETOP_PROVIDER_PLATE_INVALID');
  }
  const src = await sharp(input.bytes, { limitInputPixels: 12000000, failOn: 'warning' })
    .autoOrient()
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = await sharp(input.mask, { limitInputPixels: 12000000, failOn: 'warning' })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (src.info.width !== mask.info.width || src.info.height !== mask.info.height)
    throw Error('STUDIO_MASK_ALIGNMENT_INVALID');
  let left = src.info.width,
    top = src.info.height,
    right = -1,
    bottom = -1,
    solid = 0;
  for (let n = 0; n < mask.data.length; n++) {
    const a = mask.data[n] >= 245 ? 255 : mask.data[n] <= 10 ? 0 : mask.data[n];
    src.data[n * 4 + 3] = Math.round((a * src.data[n * 4 + 3]) / 255);
    if (src.data[n * 4 + 3]) {
      left = Math.min(left, n % src.info.width);
      right = Math.max(right, n % src.info.width);
      top = Math.min(top, Math.floor(n / src.info.width));
      bottom = Math.max(bottom, Math.floor(n / src.info.width));
    }
    if (src.data[n * 4 + 3] > 127) solid++;
  }
  if (right < left || solid / mask.data.length < 0.005 || solid / mask.data.length > 0.97)
    throw Error('STUDIO_MASK_UNSAFE');
  const box = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const cut = await sharp(src.data, {
    raw: { width: src.info.width, height: src.info.height, channels: 4 },
  })
    .extract(box)
    .rotate(placement.quarterTurns * 90)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let contactLeft = cut.info.width,
    contactRight = 0;
  for (
    let y = Math.max(0, cut.info.height - Math.max(3, Math.ceil(cut.info.height * 0.008)));
    y < cut.info.height;
    y++
  )
    for (let x = 0; x < cut.info.width; x++)
      if (cut.data[(y * cut.info.width + x) * 4 + 3] > 10) {
        contactLeft = Math.min(contactLeft, x);
        contactRight = Math.max(contactRight, x);
      }
  if (contactLeft > contactRight) throw Error('TABLETOP_CONTACT_UNRESOLVED_RECAPTURE');
  const g = planTabletopPlacement(
      box,
      placement,
      { left: contactLeft, right: contactRight },
      premium
        ? p.templateDefinition!.scene.material === 'DARK_WALNUT'
        : tabletopMaterial(p.name) === 'PALE_OAK',
    ),
    e = g.canvasEdge;
  const cutPng = await sharp(cut.data, { raw: cut.info }).png().toBuffer();
  const foreground = await sharp({
    create: { width: e, height: e, channels: 4, background: '#00000000' },
  })
    .composite([{ input: cutPng, left: g.foregroundOrigin.x, top: g.foregroundOrigin.y }])
    .png()
    .toBuffer();
  // Provider plates may be resized; the authoritative product raster NEVER is.
  const plate = input.generated
    ? await sharp(input.generated, { limitInputPixels: 1048576, failOn: 'warning' })
        .resize(e, e, { fit: 'fill' })
        .png()
        .toBuffer()
    : premium
      ? await renderStudioPlate(p.templateDefinition!, g)
      : await renderLocalTabletop(p.name, g);
  if (premium) await validateStudioPremiumRaster(plate, g.canvasEdge, true);
  else await validateTabletopV2Plate(plate, p.name, g);
  let contact: Buffer, cast: Buffer;
  if (g.camera === 'TOP_DOWN') {
    contact = await alphaShadow(foreground, g, g.shadow.contactBlur, 0, 1, g.shadow.contactOpacity);
    cast = await alphaShadow(
      foreground,
      g,
      g.shadow.castBlur,
      g.shadow.castDx,
      g.shadow.castDy,
      g.shadow.castOpacity,
    );
  } else {
    const span = Math.max(4, g.contact.spanRight - g.contact.spanLeft),
      ellipse = (dx: number, dy: number, rx: number, ry: number, opacity: number, blur: number) =>
        Buffer.from(
          `<svg width="${e}" height="${e}"><defs><filter id="s" filterUnits="userSpaceOnUse" x="0" y="0" width="${e}" height="${e}"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><ellipse filter="url(#s)" cx="${g.contact.x + dx}" cy="${g.contact.y + dy}" rx="${rx}" ry="${ry}" fill="black" opacity="${opacity}"/></svg>`,
        );
    contact = await sharp(ellipse(0, 1, span / 2, Math.max(2, e * 0.002), 0.2, 1.3))
      .png()
      .toBuffer();
    cast = await sharp(
      ellipse(
        g.shadow.castDx,
        g.shadow.castDy,
        span * 0.6,
        e * 0.009,
        g.shadow.castOpacity,
        g.shadow.castBlur,
      ),
    )
      .png()
      .toBuffer();
  }
  const png = await sharp(plate)
    .composite([{ input: cast }, { input: contact }, { input: foreground }])
    .png()
    .toBuffer();
  const fgRaw = await sharp(foreground).ensureAlpha().raw().toBuffer(),
    finalRaw = await sharp(png).ensureAlpha().raw().toBuffer();
  let compared = 0,
    mismatches = 0;
  for (let i = 0; i < fgRaw.length; i += 4)
    if (fgRaw[i + 3] === 255) {
      compared++;
      if (
        fgRaw[i] !== finalRaw[i] ||
        fgRaw[i + 1] !== finalRaw[i + 1] ||
        fgRaw[i + 2] !== finalRaw[i + 2]
      )
        mismatches++;
    }
  if (mismatches) throw Error('TABLETOP_FOREGROUND_RGB_CHANGED');
  const used = process.cpuUsage(cpu);
  return {
    png,
    foreground,
    providerInput: await sharp(foreground)
      .resize(1024, 1024, { fit: 'contain' })
      .flatten({ background: '#FFFFFF' })
      .png()
      .toBuffer(),
    warnings: [
      'HUMAN_REVIEW_REQUIRED',
      'TABLETOP_SCENE_SEMANTIC_REVIEW_REQUIRED',
      'COMPARE_LOCAL_MEANINGFUL_VALUE_REQUIRED',
      'TABLETOP_ORIENTATION_GROUNDING_REVIEW_REQUIRED',
      ...(input.generated
        ? ['GENERATED_BACKGROUND_ONLY_CAPTURED_FOREGROUND_RECOMPOSITED']
        : ['LOCAL_CONCEPT_NOT_FAL_OUTPUT']),
    ],
    details: {
      placement: g,
      crop: box,
      sourceWidth: src.info.width,
      sourceHeight: src.info.height,
      maskHash: hash(input.mask),
      foregroundHash: hash(foreground),
      nativeCutoutRgbaHash: hash(cut.data),
      preparedOpaquePixels: compared,
      opaqueRgbMismatches: mismatches,
      rgbPolicy:
        'source sRGB; approved alpha snap; native scale 1; quarter-turn pixel permutation only; no generated foreground or product relighting',
      plateHash: hash(plate),
      styleHash: hash(JSON.stringify(p)),
      sceneStyle: p.name,
      sceneVersion: p.revision,
      sourceOfScene: input.generated
        ? 'PROVIDER_BACKGROUND_ONLY'
        : 'SELF_AUTHORED_DETERMINISTIC_LOCAL_CONCEPT',
      plateGate: premium
        ? 'premium20 empty-plate structural checks; not semantic proof; mandatory surface/identity review'
        : 'style-specific structural v2 checks; not semantic proof; review geometry/value before accepting',
    },
    metrics: {
      elapsedMs: Math.round(performance.now() - started),
      cpuMicros: used.user + used.system,
      rssBytes: process.memoryUsage().rss,
      inputBytes: input.bytes.length,
      outputBytes: png.length,
      maskKind: 'APPROVED_PHASE71_MASK_NATIVE_SCALE',
    },
  };
}
