import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
export const FAL_STUDIO_MODEL = 'google/nano-banana-lite/edit';
// Reviewed fal rates, conservatively reserving full input/output model ceilings.
export const FAL_STUDIO_RESERVATION = '0.17408';
export function falStudioLimits(c: ConfigService) {
  const money = (key: string) => {
    const v = String(c.get(key) ?? '0');
    if (!/^\d{1,3}(\.\d{1,9})?$/.test(v)) throw Error('FAL_STUDIO_CONFIG_INVALID');
    return new Prisma.Decimal(v);
  };
  const monthly = money('FAL_BRAND_STUDIO_MONTHLY_BUDGET_USD'),
    daily = money('FAL_BRAND_STUDIO_DAILY_BUDGET_USD'),
    pilot = money('FAL_BRAND_STUDIO_PILOT_BUDGET_USD');
  const stylePilot = c.get('FAL_TABLETOP_PILOT_APPROVED') === 'true';
  const premiumPilot = c.get('FAL_PREMIUM_3D_PILOT_APPROVED') === 'true';
  if (stylePilot && premiumPilot) throw Error('FAL_STUDIO_LIMIT_INVALID');
  const carryCommitment =
    stylePilot || premiumPilot
      ? money(
          premiumPilot
            ? 'FAL_PREMIUM_3D_PRIOR_COMMITMENT_USD'
            : 'FAL_TABLETOP_PRIOR_COMMITMENT_USD',
        )
      : new Prisma.Decimal(0);
  const styleHashes = premiumPilot
    ? [c.get<string>('FAL_PREMIUM_3D_APPROVED_STYLE_HASH') ?? '']
    : stylePilot
      ? (JSON.parse(c.get<string>('FAL_TABLETOP_APPROVED_STYLE_HASHES') ?? '[]') as string[])
      : [];
  if (
    monthly.gt(10) ||
    daily.gt(stylePilot || premiumPilot ? '1.50' : '.50') ||
    pilot.gt(premiumPilot ? '.20' : stylePilot ? '1.10' : '.40') ||
    Number(c.get('FAL_BRAND_STUDIO_MAX_CONCURRENCY') ?? 1) !== 1 ||
    Number(c.get('FAL_BRAND_STUDIO_MAX_REGENERATIONS') ?? 1) !==
      (stylePilot || premiumPilot ? 0 : 1) ||
    (premiumPilot &&
      (c.get('FAL_PREMIUM_3D_APPROVAL_ID') !== 'REZONA_3D_BLACK_GOLD_ONE_20261123' ||
        !carryCommitment.eq('0.870400') ||
        !/^[a-f0-9]{64}$/.test(styleHashes[0]))) ||
    (stylePilot &&
      (c.get('FAL_TABLETOP_APPROVAL_ID') !== 'REZONA_TABLETOP_SIX_20261122' ||
        !carryCommitment.eq('0.348160') ||
        !Array.isArray(styleHashes) ||
        styleHashes.length !== 3 ||
        new Set(styleHashes).size !== 3 ||
        styleHashes.some((h) => !/^[a-f0-9]{64}$/.test(h))))
  )
    throw Error('FAL_STUDIO_LIMIT_INVALID');
  const sources = JSON.parse(c.get<string>('FAL_BRAND_STUDIO_INPUTS_JSON') ?? '[]') as {
    sourceHash: string;
    maskHash: string;
  }[];
  if (
    !Array.isArray(sources) ||
    sources.length > 2 ||
    sources.some((s) => !/^[a-f0-9]{64}$/.test(s.sourceHash) || !/^[a-f0-9]{64}$/.test(s.maskHash))
  )
    throw Error('FAL_STUDIO_SOURCE_ALLOWLIST_INVALID');
  return {
    monthly,
    daily,
    pilot,
    sources,
    concurrency: 1,
    stylePilot,
    premiumPilot,
    styleHashes,
    carryCommitment,
    maxRequests: premiumPilot ? 1 : stylePilot ? 6 : 2,
    reserve: new Prisma.Decimal(FAL_STUDIO_RESERVATION),
    revision: String(c.get('FAL_BRAND_STUDIO_MODEL_REVISION') ?? 'UNVERIFIED'),
  };
}
export function assertFalStudioApproved(c: ConfigService, styleHash: string) {
  const f = falStudioLimits(c),
    reviewed = Date.parse(c.get<string>('FAL_BRAND_STUDIO_REVIEWED_AT') ?? '');
  let qa = false;
  try {
    const u = new URL(c.get<string>('DATABASE_URL') ?? '');
    qa =
      u.hostname === '127.0.0.1' &&
      u.port === '55454' &&
      (f.premiumPilot
        ? /^\/rezona_phase73d_fal_[a-f0-9]{8}$/
        : f.stylePilot
          ? /^\/rezona_phase73_fal_[a-f0-9]{8}$/
          : /^\/rezona_phase72_fal_[a-f0-9]{8}$/
      ).test(u.pathname);
  } catch {
    // Malformed database URLs must fail closed below.
  }
  if (
    !qa ||
    c.get('NODE_ENV') !== 'test' ||
    c.get('FAL_BRAND_STUDIO_ENABLED') !== 'true' ||
    c.get('FAL_BRAND_STUDIO_LIVE_APPROVED') !== 'true' ||
    c.get('FAL_BRAND_STUDIO_PRIVATE_TRANSFER_APPROVED') !== 'true' ||
    c.get('FAL_BRAND_STUDIO_TERMS_REVIEWED') !== 'true' ||
    (f.stylePilot || f.premiumPilot
      ? !f.styleHashes.includes(styleHash)
      : c.get('FAL_BRAND_STUDIO_PILOT_STYLE_HASH') !== styleHash) ||
    f.sources.length < 1 ||
    !c.get('FAL_KEY') ||
    f.revision === 'UNVERIFIED' ||
    !/^[A-Za-z0-9_.-]{3,100}$/.test(f.revision) ||
    !Number.isFinite(reviewed) ||
    reviewed > Date.now() ||
    Date.now() - reviewed > 7 * 86400000 ||
    f.monthly.lte(0) ||
    f.daily.lt(f.reserve) ||
    f.pilot.lt(f.reserve)
  )
    throw Error('FAL_STUDIO_LIVE_NOT_APPROVED');
  return f;
}
export function assertFalStudioSource(c: ConfigService, sourceHash: string, maskHash?: string) {
  if (
    !falStudioLimits(c).sources.some(
      (s) => s.sourceHash === sourceHash && (!maskHash || s.maskHash === maskHash),
    )
  )
    throw Error('FAL_STUDIO_SOURCE_NOT_APPROVED');
}
export function assertFalSourcePresetNotUnknown(
  c: ConfigService,
  sourceHash: string,
  preset?: string,
) {
  if (!preset) return;
  const raw = c.get<string>('FAL_TABLETOP_UNRESOLVED_SOURCE_PRESETS_JSON');
  if (!raw || raw.length > 12000) throw Error('FAL_UNRESOLVED_FENCE_REGISTRY_REQUIRED');
  const rows = JSON.parse(raw) as { sourceHash: string; preset: string }[];
  if (
    !Array.isArray(rows) ||
    rows.length > 32 ||
    rows.some(
      (r) =>
        !/^[a-f0-9]{64}$/.test(r.sourceHash) ||
        ![
          'REZONA_STYLE_CLEAN_TABLE_V1',
          'REZONA_STYLE_WARM_PREMIUM_TABLE_V1',
          'REZONA_STYLE_MODERN_SOFT_STUDIO_V1',
          'REZONA_STYLE_3D_BLACK_GOLD_V1',
        ].includes(r.preset),
    )
  )
    throw Error('FAL_UNRESOLVED_FENCE_REGISTRY_INVALID');
  if (rows.some((r) => r.sourceHash === sourceHash && r.preset === preset))
    throw Error('FAL_SOURCE_STYLE_UNKNOWN_BLOCKED');
}
