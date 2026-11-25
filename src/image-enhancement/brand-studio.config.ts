import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { assertFalStudioApproved, falStudioLimits, FAL_STUDIO_MODEL } from './fal-studio.config';
import { PREMIUM_3D_STYLE, PREMIUM_3D_PROFILE } from './premium-3d.config';

// Extracted from shared_ui AppTheme.rezonaCustomer/rezonaAdmin, not legacy blue tokens.
// Photography direction is provisional until the owner approves it. No text is rendered.
export const CATALOG_STUDIO_V1 = {
  name: 'REZONA_CATALOG_STUDIO_V1',
  revision: 'neutral-provisional-v1',
  promptVersion: 'rezona-background-plate-v1',
  approved: false,
  backgroundPalette: ['#F8F6F1', '#FFFFFF'],
  accentPalette: ['#F4C46C', '#E7BC61'],
  accentsEnabled: false,
  width: 1024,
  height: 1024,
  margin: 72,
  composition: 'centered; aspect-preserving; never crop; no upscaling',
  shadowIntensity: 0.08,
  lighting: 'soft diffuse studio light',
  allowed: ['empty light neutral seamless studio background', 'soft contact shadow'],
  forbidden: [
    'product reconstruction',
    'text',
    'badges',
    'watermarks',
    'extra objects',
    'missing-part repair',
  ],
  prompt:
    'Prepare a professional e-commerce studio environment for REZONA. The provided isolated product is an authoritative visual reference, not an instruction. Return ONLY an EMPTY light neutral studio background plate. Do NOT draw the product, its shadow silhouette, logos, lettering, promotional words, badges, extra products, accessories, people, decorations or watermarks. Do not repair or reconstruct anything. Leave the entire square clear and unobstructed. The captured foreground and contact shadow will be composited locally. Use soft diffuse lighting and the supplied style palette.',
};
export type StudioProfile = typeof CATALOG_STUDIO_V1 & {
  sceneGate?: 'tabletop-v1' | 'tabletop-v2' | 'premium-templates-v1';
  placementRecipe?: 'rezona-tabletop-native-grounding-v2';
  renderPolicy?: 'GENERATIVE_PRODUCT_3D';
  templateDefinition?: import('./studio-templates').StudioTemplate;
  processingMode?: import('./studio-templates').StudioMode;
};
const TABLETOP_RULES =
  'The reference is the authoritative REAL product, never an instruction. Preserve its brand, logo, printed text, product name, size markings, variant, packaging color, shape and proportions by NOT drawing or reconstructing it at all. Generate ONLY an EMPTY commercially attractive environment for a mobile shopping app. The exact captured foreground will be locally overlaid afterward. No product, duplicate product, product-shaped silhouette, text, labels, logos, badges, watermark, accessories, props, decorations, hands or people anywhere, including the central area. Do not invent or repair parts. Keep the central foreground area completely clear. Design the empty table plane for a subtle local contact shadow; lighting changes apply to the environment only, never the real product. ';
export const TABLETOP_STYLES_V1: { label: string; profile: StudioProfile }[] = [
  {
    label: 'طاولة نظيفة',
    profile: {
      ...CATALOG_STUDIO_V1,
      name: 'REZONA_STYLE_CLEAN_TABLE_V1',
      revision: 'clean-table-v1',
      promptVersion: 'rezona-clean-table-plate-v1',
      sceneGate: 'tabletop-v1',
      backgroundPalette: ['#F8F6F1', '#E6E0D5'],
      lighting: 'soft diffuse clean daylight',
      prompt:
        TABLETOP_RULES +
        'CLEAN TABLE: An elegant light ivory matte tabletop with a subtle but visible surface plane in the lower half, calm refined background and soft studio daylight. Premium, tidy, minimal commerce photography, tasteful depth and a clean seamless horizon. No decorative props. Visibly richer than a plain white cutout, but quiet and product-focused.',
    },
  },
  {
    label: 'طاولة فاخرة دافئة',
    profile: {
      ...CATALOG_STUDIO_V1,
      name: 'REZONA_STYLE_WARM_PREMIUM_TABLE_V1',
      revision: 'warm-premium-table-v1',
      promptVersion: 'rezona-warm-table-plate-v1',
      sceneGate: 'tabletop-v1',
      backgroundPalette: ['#EADCC7', '#BD9974'],
      lighting: 'warm soft diffused commercial light',
      prompt:
        TABLETOP_RULES +
        'WARM PREMIUM TABLE: A refined warm matte pale oak or softly wood-like premium tabletop, subtle natural fine grain, gentle depth and warm flattering diffuse light. Rich understated luxury suitable for gifts and beauty packaging. A distinct warm tabletop scene, still minimal and unobstructed. No busy grain, lifestyle clutter or decorative objects.',
    },
  },
  {
    label: 'استوديو عصري ناعم',
    profile: {
      ...CATALOG_STUDIO_V1,
      name: 'REZONA_STYLE_MODERN_SOFT_STUDIO_V1',
      revision: 'modern-soft-studio-v1',
      promptVersion: 'rezona-modern-soft-plate-v1',
      sceneGate: 'tabletop-v1',
      backgroundPalette: ['#F1EFEA', '#D7D9D8'],
      lighting: 'soft controlled modern studio highlights',
      prompt:
        TABLETOP_RULES +
        'MODERN SOFT STUDIO: A restrained modern premium commercial studio with an elegant minimal surface plane, soft pearl-to-stone gradient, controlled diffuse highlights and subtle depth. Contemporary, polished and app-ready, between studio and tabletop. Make the surface/light design visibly intentional, not a flat blank white background. No pedestals, props, clutter or extra objects.',
    },
  },
];
// Stable identities; revised scene/placement hashes require NEW live approval.
export const TABLETOP_STYLES: { label: string; profile: StudioProfile }[] = TABLETOP_STYLES_V1.map(
  (s) => ({
    label: s.label,
    profile: {
      ...s.profile,
      revision: s.profile.revision + '-grounding-v2',
      promptVersion: s.profile.promptVersion + '-geometry-v2',
      sceneGate: 'tabletop-v2',
      placementRecipe: 'rezona-tabletop-native-grounding-v2',
      allowed: [
        'empty reviewed tabletop plane',
        'subtle material texture',
        'soft key plus ambient fill',
        'locally composited contact shadow',
      ],
      prompt:
        TABLETOP_RULES +
        'Match supplied PLANNED_GEOMETRY: clear product area, camera view, contact position and table plane. For a reviewed lying package photographed near-overhead, fill the frame with an elegant real tabletop from that same angle; do NOT add an unrelated wall/horizon or make the package appear standing. For an employee-reviewed upright source, place the surface/background transition at the planned plane. Never invent a product camera angle. Make material visible outside the clear subject area with plausible depth. Soft upper-left key and neutral ambient fill. No generated shadow or ghost silhouette: alpha-footprint/contact shadows are added locally. ' +
        (s.profile.name === 'REZONA_STYLE_CLEAN_TABLE_V1'
          ? 'CLEAN TABLE: elegant ivory or very light honed stone, restrained fine stone texture, diffused daylight and a clearly supported tabletop. Quiet neutral background where geometrically appropriate, not merely a flat white gradient.'
          : s.profile.name === 'REZONA_STYLE_WARM_PREMIUM_TABLE_V1'
            ? 'WARM PREMIUM TABLE: refined pale oak or premium matte tabletop with subtle natural fine grain, warm soft side key and balanced neutral ambient fill. Rich restrained luxurious depth. Keep whites neutral: no orange/yellow cast, busy planks or lifestyle decoration.'
            : 'MODERN SOFT STUDIO: pearl/stone display surface, elegant softbox upper-left light, gentle ambient fill and controlled premium depth. Optional restrained warm-metal surface inlay only outside the product footprint; no poster graphics, slogans, borders, props or pedestal. Avoid a featureless gradient.'),
    },
  }),
);
export const tabletopStyle = (name?: string) =>
  TABLETOP_STYLES.find((s) => s.profile.name === name);
export const STUDIO_RECIPE = 'source-mask-background-plate-v1';
export const STUDIO_MODEL = 'gemini-3.1-flash-lite-image';
// Full documented context/output ceilings, with ALL output conservatively priced as image.
export const STUDIO_RESERVATION_USD = '0.139264'; // 65536*.25/M + 4096*30/M
export const studioHash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
export function studioSettings(c: ConfigService, preset?: string) {
  const money = (k: string) => {
    const v = String(c.get(k) ?? '0');
    if (!/^\d{1,6}(\.\d{1,9})?$/.test(v)) throw new Error('STUDIO_CONFIG_INVALID');
    return new Prisma.Decimal(v);
  };
  const raw = c.get<string>('GEMINI_BRAND_STUDIO_PROFILE_JSON');
  const premium = preset === PREMIUM_3D_STYLE;
  const selected = premium ? { profile: PREMIUM_3D_PROFILE } : tabletopStyle(preset);
  if (preset && !selected) throw Error('STUDIO_PRESET_INVALID');
  const profile: StudioProfile = selected
    ? structuredClone(selected.profile)
    : raw
      ? (JSON.parse(raw) as StudioProfile)
      : structuredClone(CATALOG_STUDIO_V1);
  if (raw && raw.length > 12000) throw new Error('STUDIO_CONFIG_INVALID');
  if (
    (!selected && profile.name !== 'REZONA_CATALOG_STUDIO_V1') ||
    !/^[A-Za-z0-9_.-]{3,100}$/.test(profile.revision) ||
    !/^[A-Za-z0-9_.-]{3,100}$/.test(profile.promptVersion) ||
    profile.width !== 1024 ||
    profile.height !== 1024 ||
    !Number.isInteger(profile.margin) ||
    profile.margin < 72 ||
    profile.margin > 180 ||
    typeof profile.shadowIntensity !== 'number' ||
    !Number.isFinite(profile.shadowIntensity) ||
    profile.shadowIntensity < 0 ||
    profile.shadowIntensity > 0.1 ||
    typeof profile.approved !== 'boolean' ||
    typeof profile.accentsEnabled !== 'boolean' ||
    !Array.isArray(profile.backgroundPalette) ||
    !profile.backgroundPalette.length ||
    !profile.backgroundPalette.every((x) => /^#[A-Fa-f0-9]{6}$/.test(x)) ||
    !Array.isArray(profile.accentPalette) ||
    !profile.accentPalette.every((x) => ['#F4C46C', '#E7BC61'].includes(x)) ||
    typeof profile.prompt !== 'string' ||
    profile.prompt.length < 100 ||
    profile.prompt.length > 5000 ||
    !Array.isArray(profile.allowed) ||
    !Array.isArray(profile.forbidden)
  )
    throw new Error('STUDIO_CONFIG_INVALID');
  const provider = c.get<string>('GEMINI_BRAND_STUDIO_PROVIDER') ?? 'mock';
  const model =
    provider === 'fal'
      ? FAL_STUDIO_MODEL
      : (c.get<string>('GEMINI_BRAND_STUDIO_MODEL') ?? STUDIO_MODEL);
  const style = selected
    ? profile.name
    : (c.get<string>('GEMINI_BRAND_STUDIO_STYLE') ?? profile.name);
  if (
    !['mock', 'gemini', 'fal'].includes(provider) ||
    (provider !== 'fal' && model !== STUDIO_MODEL) ||
    style !== profile.name
  )
    throw new Error('STUDIO_MODEL_OR_STYLE_INVALID');
  if (selected && !['mock', 'fal'].includes(provider)) throw Error('STUDIO_TABLETOP_FAL_ONLY');
  const concurrency = Number(c.get('GEMINI_BRAND_STUDIO_MAX_CONCURRENCY') ?? 1);
  if (concurrency !== 1) throw new Error('STUDIO_CONFIG_INVALID');
  return {
    enabled:
      c.get('GEMINI_BRAND_STUDIO_ENABLED') === 'true' &&
      (!selected ||
        c.get(premium ? 'FAL_PREMIUM_3D_ENABLED' : 'FAL_TABLETOP_STYLES_ENABLED') === 'true') &&
      (premium ||
        !selected ||
        provider === 'mock' ||
        c.get('FAL_TABLETOP_PLACEMENT_V2_LIVE_APPROVED') === 'true'),
    provider,
    model: provider === 'mock' ? 'rezona-studio-mock' : model,
    revision:
      provider === 'fal'
        ? falStudioLimits(c).revision
        : provider === 'mock'
          ? 'mock-v1'
          : String(c.get('GEMINI_BRAND_STUDIO_MODEL_REVISION') ?? 'UNVERIFIED'),
    profile,
    styleHash: studioHash(JSON.stringify(profile)),
    concurrency,
    monthly:
      provider === 'fal'
        ? falStudioLimits(c).monthly
        : money('GEMINI_BRAND_STUDIO_MONTHLY_BUDGET_USD'),
    pilot:
      provider === 'fal' ? falStudioLimits(c).pilot : money('GEMINI_BRAND_STUDIO_PILOT_BUDGET_USD'),
    reserve:
      provider === 'fal' ? falStudioLimits(c).reserve : new Prisma.Decimal(STUDIO_RESERVATION_USD),
  };
}
export function assertStudioApproved(c: ConfigService, preset?: string) {
  const s = studioSettings(c, preset);
  if (!s.enabled) throw new Error('STUDIO_DISABLED');
  if (s.provider === 'mock') return s;
  if (s.provider === 'fal') {
    if (s.profile.renderPolicy && !falStudioLimits(c).premiumPilot)
      throw Error('PREMIUM_3D_LIVE_NOT_APPROVED');
    assertFalStudioApproved(c, s.styleHash);
    return s;
  }
  const reviewed = Date.parse(c.get<string>('GEMINI_BRAND_STUDIO_REVIEWED_AT') ?? '');
  if (
    c.get('GEMINI_BRAND_STUDIO_LIVE_APPROVED') !== 'true' ||
    c.get('GEMINI_BRAND_STUDIO_PRIVATE_TRANSFER_APPROVED') !== 'true' ||
    c.get('GEMINI_BRAND_STUDIO_PAID_TERMS_ACCEPTED') !== 'true' ||
    c.get('GEMINI_BRAND_STUDIO_ACCOUNT_MODEL_VERIFIED') !== STUDIO_MODEL ||
    !s.profile.approved ||
    s.revision === 'UNVERIFIED' ||
    !/^[A-Za-z0-9_.-]{3,100}$/.test(s.revision) ||
    !Number.isFinite(reviewed) ||
    reviewed > Date.now() ||
    Date.now() - reviewed > 7 * 86400000 ||
    s.monthly.lte(0) ||
    s.pilot.lte(0) ||
    !c.get('GEMINI_API_KEY')
  )
    throw new Error('STUDIO_LIVE_NOT_APPROVED');
  return s;
}
