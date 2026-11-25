import sharp from 'sharp';
import type { StudioTemplate } from './studio-templates';
import type { TabletopGeometry } from './tabletop-placement';
// Self-authored empty scene concepts, not photographs or fal-quality examples.
export async function renderStudioPlate(t: Readonly<StudioTemplate>, g: TabletopGeometry) {
  const s = t.scene,
    e = g.canvasEdge,
    top = g.camera === 'TOP_DOWN',
    i = s.index;
  const surface =
    s.material === 'DARK_WALNUT'
      ? '#33271E'
      : s.material === 'BLACK_MARBLE'
        ? '#25262B'
        : s.material === 'BLACK_GLASS'
          ? '#15191E'
          : s.material === 'BLACK_FABRIC'
            ? '#222127'
            : '#26282C';
  let architecture = '';
  if (s.architecture === 'ARCH')
    architecture =
      '<path d="M180 580V280A332 250 0 0 1 844 280V580" fill="none" stroke="#BFA270" stroke-width="5" opacity=".6"/>';
  else if (s.architecture === 'CIRCUIT')
    architecture =
      '<path d="M40 85H260V180H390M984 125H740V230H660M50 300H190V400M974 350H850V440" fill="none" stroke="#C4A066" stroke-width="2" opacity=".38"/>';
  else if (s.architecture === 'BOUTIQUE')
    architecture =
      '<path d="M110 0V590M914 0V590M110 140H300M724 140H914" fill="none" stroke="#9B8059" stroke-width="3" opacity=".35"/>';
  else if (s.architecture === 'VANITY')
    architecture =
      '<path d="M140 90H884V390M200 110V450" fill="none" stroke="#9D8258" stroke-width="3" opacity=".28"/>';
  else if (s.architecture === 'LIVING')
    architecture =
      '<path d="M60 0V580M964 0V580M60 120H240M784 120H964" stroke="#72654F" stroke-width="3" opacity=".33"/>';
  else if (s.architecture === 'GALLERY')
    architecture = `<path d="M${80 + i * 2} 0V580M${944 - i * 2} 0V580" stroke="#AC905F" stroke-width="3" opacity=".32"/>`;
  const texture: string[] = [];
  if (s.material === 'BLACK_MARBLE')
    for (let n = 0; n < 9; n++)
      texture.push(
        `<path d="M${n * 147 - 120 + i * 3} 0Q${n * 107} 380 ${n * 137 + 40} 650T${n * 151 + 160} 1024" stroke="#9A927C" stroke-width="1.5" opacity=".14" fill="none"/>`,
      );
  else if (s.material === 'DARK_WALNUT')
    for (let n = 0; n < 35; n++)
      texture.push(
        `<path d="M0 ${n * 34}Q400 ${n * 34 + 12} 1024 ${n * 34 - 4}" stroke="${n % 2 ? '#937757' : '#5F4F3E'}" stroke-width="1" opacity=".16" fill="none"/>`,
      );
  else if (s.material === 'BLACK_FABRIC')
    for (let n = 0; n < 26; n++)
      texture.push(
        `<path d="M${n * 42} 0L${n * 42 + 100} 1024" stroke="#A7A5A1" stroke-width="1" opacity=".07"/>`,
      );
  const shape =
    s.display === 'ROUND'
      ? `<ellipse cx="512" cy="${top ? 512 : 820}" rx="${top ? 452 : 445}" ry="${top ? 452 : 118}"/>`
      : top
        ? '<rect x="60" y="60" width="904" height="904" rx="18"/>'
        : s.display === 'PODIUM'
          ? '<path d="M170 680H854L930 900H94Z"/>'
          : s.display === 'PLATFORM'
            ? '<path d="M100 700H924L980 900H44Z"/>'
            : '<path d="M0 580H1024V900H0Z"/>';
  const contact = top
    ? ''
    : s.display === 'ROUND'
      ? '<path d="M67 820V890A445 118 0 0 0 957 890V820A445 118 0 0 1 67 820"/>'
      : s.display === 'PODIUM'
        ? '<path d="M94 900H930V990H94Z"/>'
        : s.display === 'PLATFORM'
          ? '<path d="M44 900H980V985H44Z"/>'
          : '<rect x="0" y="900" width="1024" height="88"/>';
  const beam =
    s.lighting === 'SPOTLIGHT'
      ? '<ellipse cx="512" cy="370" rx="300" ry="470" fill="url(#beam)"/>'
      : s.lighting === 'OVERHEAD'
        ? '<ellipse cx="470" cy="140" rx="430" ry="220" fill="url(#beam)"/>'
        : '<ellipse cx="130" cy="200" rx="440" ry="430" fill="url(#beam)"/>';
  const svg = `<svg width="${e}" height="${e}" viewBox="0 0 1024 1024"><defs><radialGradient id="bg"><stop stop-color="#28292C"/><stop offset="1" stop-color="#08090B"/></radialGradient><radialGradient id="beam"><stop stop-color="#D4B77D" stop-opacity=".13"/><stop offset="1" stop-color="#D4B77D" stop-opacity="0"/></radialGradient><linearGradient id="plane" x2=".8" y2="1"><stop stop-color="${surface}"/><stop offset=".6" stop-color="${surface}"/><stop offset="1" stop-color="#111316"/></linearGradient><clipPath id="table">${shape}</clipPath></defs><rect width="1024" height="1024" fill="url(#bg)"/>${top ? '' : architecture}${beam}<g fill="#141619" stroke="#786447" stroke-width="3">${contact}</g><g fill="url(#plane)" stroke="#BE9A5A" stroke-opacity=".65" stroke-width="3">${shape}</g><g clip-path="url(#table)">${texture.join('')}${s.material === 'BLACK_GLASS' ? '<path d="M0 830L1024 640M0 870L1024 680" stroke="#D8C398" stroke-width="2" opacity=".15"/>' : ''}</g>${top || s.display === 'ROUND' ? '' : '<path d="M100 902H924" stroke="#E7BC61" stroke-width="2" opacity=".65"/>'}</svg>`;
  return sharp(Buffer.from(svg), { limitInputPixels: 12000000 }).png().toBuffer();
}
export async function validateStudioPremiumRaster(bytes: Buffer, edge: number, plate: boolean) {
  if (bytes.length > 12 * 1024 * 1024) throw Error('STUDIO_OUTPUT_TOO_LARGE');
  const image = sharp(bytes, { limitInputPixels: 12000000, failOn: 'warning' }).timeout({
      seconds: 12,
    }),
    meta = await image.metadata();
  if (
    !['png', 'jpeg', 'webp'].includes(meta.format ?? '') ||
    (meta.pages ?? 1) !== 1 ||
    meta.width !== edge ||
    meta.height !== edge
  )
    throw Error('STUDIO_OUTPUT_INVALID');
  const data = await image.toColourspace('srgb').ensureAlpha().raw().toBuffer();
  let border = 0,
    dark = 0,
    gold = 0,
    white = 0,
    colors = 0,
    sum = 0,
    sq = 0;
  for (let y = 0; y < edge; y++)
    for (let x = 0; x < edge; x++) {
      const n = (y * edge + x) * 4,
        r = data[n],
        g = data[n + 1],
        b = data[n + 2],
        l = (r + g + b) / 3,
        isGold = r > 75 && g > 45 && g / r > 0.59 && g / r < 0.98 && b < g * 0.94;
      if (data[n + 3] !== 255) throw Error('STUDIO_OUTPUT_ALPHA_REJECTED');
      if (x < edge * 0.15 || x > edge * 0.85 || y < edge * 0.15 || y > edge * 0.85) {
        border++;
        if (Math.max(r, g, b) < 95) dark++;
        if (isGold) gold++;
      }
      if (l > 170 && !isGold) white++;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 85 && !isGold) colors++;
      sum += l;
      sq += l * l;
    }
  const count = edge * edge;
  if (dark / border < 0.3 || gold / border < 0.0002)
    throw Error('STUDIO_BLACK_GOLD_THEME_REJECTED');
  if (plate && (white / count > 0.012 || colors / count > 0.015))
    throw Error('STUDIO_PLATE_SUBJECT_OR_COLOR_REJECTED');
  if (Math.sqrt(Math.max(0, sq / count - (sum / count) ** 2)) < 2)
    throw Error('STUDIO_SCENE_TOO_FLAT');
  return {
    darkBorderFraction: dark / border,
    goldBorderFraction: gold / border,
    semanticValidation: 'HUMAN_REQUIRED_NOT_AN_OBJECT_OR_IDENTITY_DETECTOR',
  };
}
