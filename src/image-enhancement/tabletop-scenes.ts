import sharp from 'sharp';
import type { TabletopGeometry } from './tabletop-placement';
export type TabletopMaterial = 'IVORY_STONE' | 'PALE_OAK' | 'PEARL_STONE';
export function tabletopMaterial(style: string): TabletopMaterial {
  if (style === 'REZONA_STYLE_CLEAN_TABLE_V1') return 'IVORY_STONE';
  if (style === 'REZONA_STYLE_WARM_PREMIUM_TABLE_V1') return 'PALE_OAK';
  if (style === 'REZONA_STYLE_MODERN_SOFT_STUDIO_V1') return 'PEARL_STONE';
  throw Error('TABLETOP_STYLE_INVALID');
}
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
// Self-authored deterministic procedural materials. No downloaded/licensed photographs,
// no model, no scene objects or product pixels, no text rendered into candidate images.
export async function renderLocalTabletop(style: string, g: TabletopGeometry): Promise<Buffer> {
  const material = tabletopMaterial(style),
    e = g.canvasEdge,
    pixels = Buffer.alloc(e * e * 3);
  const base =
    material === 'PALE_OAK'
      ? [219, 208, 190]
      : material === 'IVORY_STONE'
        ? [235, 232, 223]
        : [224, 229, 230];
  let rng = 731031;
  for (let y = 0; y < e; y++)
    for (let x = 0; x < e; x++) {
      rng = (Math.imul(rng, 1664525) + 1013904223) | 0;
      const noise = ((rng >>> 16) & 255) / 255 - 0.5,
        u = x / e,
        v = y / e;
      const key = 17 * Math.exp(-((u - 0.16) ** 2 / 0.7 + (v - 0.12) ** 2 / 0.9));
      const depth = -8 * ((u - 0.38) ** 2 + (v - 0.4) ** 2);
      let texture: number;
      if (material === 'PALE_OAK') {
        const grain = y * 0.19 + 1.9 * Math.sin(x * 0.0023) + 0.55 * Math.sin(x * 0.013);
        texture = Math.sin(grain) * 1.9 + Math.sin(grain * 2.31) * 0.8 + noise * 1.4;
        const seam = Math.abs(((y + Math.sin(x * 0.0018) * 4) % (e * 0.23)) - e * 0.115);
        if (seam < 1.2) texture -= 7;
      } else if (material === 'IVORY_STONE')
        texture =
          noise * 1.5 + Math.sin(x * 0.018 + Math.sin(y * 0.009)) * Math.cos(y * 0.014) * 0.6;
      else texture = noise * 0.7;
      const wall = g.camera === 'UPRIGHT' && y < g.table.y;
      const horizon =
        g.camera === 'UPRIGHT' ? -3 * Math.exp(-(((y - g.table.y) / (e * 0.008)) ** 2)) : 0;
      const edgeFill =
        material === 'PEARL_STONE'
          ? 5 * Math.exp(-((u - 0.83) ** 2 / 0.14 + (v - 0.35) ** 2 / 0.4))
          : 0;
      for (let c = 0; c < 3; c++)
        pixels[(y * e + x) * 3 + c] = clamp(
          (wall ? [237, 238, 235][c] : base[c]) +
            key +
            depth +
            (wall ? texture * 0.15 : texture) +
            horizon +
            edgeFill,
        );
      if (material === 'PEARL_STONE' && !wall && Math.abs(x - e * 0.055) < 0.65) {
        // Restrained brass seam in the surface, far from the product; not a graphic badge.
        const i = (y * e + x) * 3;
        for (let c = 0; c < 3; c++)
          pixels[i + c] = clamp(pixels[i + c] * 0.72 + [189, 176, 147][c] * 0.28);
      }
    }
  return sharp(pixels, { raw: { width: e, height: e, channels: 3 } })
    .png()
    .toBuffer();
}
export async function validateTabletopV2Plate(
  bytes: Buffer,
  style: string,
  g: TabletopGeometry,
): Promise<void> {
  const material = tabletopMaterial(style),
    image = sharp(bytes, { failOn: 'warning', limitInputPixels: 4096 * 4096 }),
    m = await image.metadata();
  if (
    !['png', 'jpeg', 'webp'].includes(m.format ?? '') ||
    (m.pages ?? 1) !== 1 ||
    m.width !== g.canvasEdge ||
    m.height !== g.canvasEdge
  )
    throw Error('TABLETOP_SCENE_DIMENSIONS_INVALID');
  const rgba = await image.ensureAlpha().raw().toBuffer(),
    e = g.canvasEdge,
    count = e * e;
  let bad = 0,
    edgeCount = 0,
    sum = 0,
    squared = 0,
    surfaceSamples = 0;
  const chroma = material === 'PALE_OAK' ? 62 : material === 'IVORY_STONE' ? 38 : 32;
  for (let y = 0; y < e; y++)
    for (let x = 0; x < e; x++) {
      const i = (y * e + x) * 4,
        rgb = [rgba[i], rgba[i + 1], rgba[i + 2]],
        l = (rgb[0] + rgb[1] + rgb[2]) / 3;
      if (rgba[i + 3] !== 255) throw Error('TABLETOP_SCENE_TRANSPARENCY_REJECTED');
      if (
        Math.min(...rgb) < (material === 'PALE_OAK' ? 105 : 135) ||
        Math.max(...rgb) - Math.min(...rgb) > chroma ||
        rgb[0] - rgb[2] > (material === 'PALE_OAK' ? 52 : 30)
      )
        bad++;
      if (x && Math.max(...rgb.map((v, k) => Math.abs(v - rgba[i - 4 + k]))) > 22) edgeCount++;
      if (y && Math.max(...rgb.map((v, k) => Math.abs(v - rgba[i - e * 4 + k]))) > 22) edgeCount++;
      if (y >= g.table.y) {
        sum += l;
        squared += l * l;
        surfaceSamples++;
      }
    }
  if (bad / count > 0.035 || edgeCount / count > (material === 'PALE_OAK' ? 0.035 : 0.018))
    throw Error('TABLETOP_SCENE_OBJECT_COLOR_OR_CLUTTER_REJECTED');
  if (Math.sqrt(Math.max(0, squared / surfaceSamples - (sum / surfaceSamples) ** 2)) < 1.5)
    throw Error('TABLETOP_SCENE_TOO_FLAT_KEEP_LOCAL');
  // Not a semantic object/label detector. Explicit scene/grounding/value review remains mandatory.
}
