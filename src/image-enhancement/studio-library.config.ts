import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { CATALOG_STUDIO_V1, type StudioProfile } from './brand-studio.config';
import { FAL_STUDIO_MODEL } from './fal-studio.config';
import { prepaidStudioEvidence } from './prepaid-studio-policy';
import { assertStudioDispatchReleasePolicy } from './studio-release-policy';
import {
  studioTemplate,
  studioPrompt,
  studioPromptHash,
  studioHash,
  STUDIO_TEMPLATES,
  type StudioSelection,
  type StudioTemplate,
  type StudioMode,
} from './studio-templates';
export type ReviewedStudioPricing = {
  model: string;
  currency: 'USD';
  unit: 'units';
  unitPriceUsd: string;
  maxBillableUnits: string;
  reviewedAt: string;
  quoteFingerprint: string;
  evidenceId: string;
  sourceUrl: string;
};
const money = (v: unknown) => {
  if (v != null && typeof v !== 'string' && typeof v !== 'number')
    throw Error('STUDIO_BUDGET_CONFIG_INVALID');
  const s = String(v ?? '0');
  if (!/^\d{1,3}(\.\d{1,9})?$/.test(s)) throw Error('STUDIO_BUDGET_CONFIG_INVALID');
  return new Prisma.Decimal(s);
};
export function reviewedStudioPricing(c: ConfigService) {
  const raw = c.get<string>('PRODUCT_STUDIO_REVIEWED_PRICING_JSON');
  if (!raw || raw.length > 3000) throw Error('STUDIO_REVIEWED_PRICING_REQUIRED');
  const p = JSON.parse(raw) as ReviewedStudioPricing,
    at = Date.parse(p.reviewedAt),
    price = money(p.unitPriceUsd),
    units = money(p.maxBillableUnits);
  if (
    p.model !== FAL_STUDIO_MODEL ||
    p.currency !== 'USD' ||
    p.unit !== 'units' ||
    p.sourceUrl !== 'https://api.fal.ai/v1/models/pricing' ||
    !/^fal-reviewed-[A-Za-z0-9_-]{6,100}$/.test(p.evidenceId ?? '') ||
    !/^[a-f0-9]{64}$/.test(p.quoteFingerprint ?? '') ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 7 * 86400000 ||
    price.lte(0) ||
    units.lte(0)
  )
    throw Error('STUDIO_REVIEWED_PRICING_INVALID');
  const reserve = price.mul(units).toDecimalPlaces(9, Prisma.Decimal.ROUND_UP);
  if (reserve.gt(1)) throw Error('STUDIO_REVIEWED_CEILING_TOO_HIGH');
  return { record: p, reserve };
}
export function studioLibraryProfile(t: Readonly<StudioTemplate>, mode: StudioMode): StudioProfile {
  const p = studioPrompt(t, mode);
  return {
    ...CATALOG_STUDIO_V1,
    name: t.styleProfileId,
    revision: `studio20-${t.code.toLowerCase()}-v${t.version}-${mode.toLowerCase()}`,
    promptVersion: `${t.code.toLowerCase()}-v${t.version}-${studioPromptHash(t, mode).slice(0, 16)}`,
    backgroundPalette: ['#08090B', '#141517'],
    accentPalette: ['#F4C46C', '#E7BC61'],
    accentsEnabled: true,
    prompt: p.prompt,
    composition: t.composition,
    lighting: `${t.scene.lighting}; upper-left key; restrained gold environment, neutral subject`,
    allowed: ['selected premium scene only'],
    forbidden: ['extra product', 'wrong identity', 'unreviewed publication'],
    templateDefinition: t,
    processingMode: mode,
    ...(mode === 'FAITHFUL_COMPOSITE'
      ? {
          sceneGate: 'premium-templates-v1' as const,
          placementRecipe: 'rezona-tabletop-native-grounding-v2' as const,
        }
      : { renderPolicy: 'GENERATIVE_PRODUCT_3D' as const }),
  };
}
export function studioLibrarySettings(
  c: ConfigService,
  s: Pick<StudioSelection, 'templateId' | 'templateVersion' | 'processingMode'>,
) {
  const t = studioTemplate(s.templateId, s.templateVersion),
    profile = studioLibraryProfile(t, s.processingMode),
    provider = c.get<string>('PRODUCT_STUDIO_PROVIDER') ?? 'mock';
  if (!['mock', 'fal'].includes(provider)) throw Error('STUDIO_PROVIDER_INVALID');
  let reserve = new Prisma.Decimal(0),
    pricing: ReviewedStudioPricing | undefined;
  if (provider === 'fal') {
    const p = reviewedStudioPricing(c);
    reserve = p.reserve;
    pricing = p.record;
  }
  return {
    enabled:
      c.get('PRODUCT_STUDIO_ENABLED') === 'true' &&
      (provider === 'mock'
        ? c.get('PRODUCT_STUDIO_MOCK_APPROVED') === 'true'
        : c.get('PRODUCT_STUDIO_LIVE_APPROVED') === 'true'),
    library: true,
    provider,
    model: provider === 'mock' ? 'rezona-studio-library-MOCK' : FAL_STUDIO_MODEL,
    revision:
      provider === 'mock'
        ? 'mock-studio20-v1'
        : String(c.get('PRODUCT_STUDIO_MODEL_REVISION') ?? 'UNVERIFIED'),
    profile,
    styleHash: studioHash(JSON.stringify(profile)),
    promptHash: studioPromptHash(t, s.processingMode),
    concurrency: 1,
    monthly: money(c.get('PRODUCT_STUDIO_MONTHLY_BUDGET_USD')),
    pilot: money(c.get('PRODUCT_STUDIO_PILOT_BUDGET_USD')),
    daily: money(c.get('PRODUCT_STUDIO_DAILY_BUDGET_USD')),
    carry: money(c.get('PRODUCT_STUDIO_PRIOR_COMMITMENT_USD')),
    reserve,
    pricing,
    template: t,
  };
}
export function assertStudioLibraryApproved(
  c: ConfigService,
  s: Pick<StudioSelection, 'templateId' | 'templateVersion' | 'processingMode'>,
) {
  const x = studioLibrarySettings(c, s);
  assertStudioDispatchReleasePolicy(c, x.provider);
  if (!x.enabled) throw Error('STUDIO_GENERATION_DISABLED');
  if (x.provider === 'mock') return x;
  const prepaid = prepaidStudioEvidence(c);
  let qa = false;
  try {
    const u = new URL(c.get<string>('DATABASE_URL') ?? '');
    qa =
      u.hostname === '127.0.0.1' &&
      u.port === '55455' &&
      /^\/rezona_studio20_qa_[a-f0-9]{8}$/.test(u.pathname);
  } catch {
    /* fail closed */
  }
  const scope = JSON.parse(c.get<string>('PRODUCT_STUDIO_APPROVED_SCOPE_JSON') ?? '[]') as {
    templateId: string;
    version: number;
    mode: string;
    promptHash: string;
  }[];
  if (
    (!qa && !prepaid) ||
    c.get('NODE_ENV') !== 'test' ||
    c.get('PRODUCT_STUDIO_PRIVATE_TRANSFER_APPROVED') !== 'true' ||
    c.get('PRODUCT_STUDIO_TERMS_REVIEWED') !== 'true' ||
    !c.get('FAL_KEY') ||
    x.revision === 'UNVERIFIED' ||
    !/^[A-Za-z0-9_.-]{3,100}$/.test(x.revision) ||
    !/^[A-Za-z0-9_-]{8,100}$/.test(c.get<string>('PRODUCT_STUDIO_APPROVAL_ID') ?? '') ||
    c.get('PRODUCT_STUDIO_MAX_CONCURRENCY') !== '1' ||
    c.get('PRODUCT_STUDIO_MAX_REGENERATIONS') !== '0' ||
    x.monthly.lte(0) ||
    x.monthly.gt(10) ||
    x.daily.lt(x.reserve) ||
    x.daily.gt(prepaid ? 10 : '1.50') ||
    x.pilot.lt(x.reserve) ||
    x.pilot.gt(prepaid ? 10 : 1) ||
    x.carry.lt('1.044480') ||
    !Array.isArray(scope) ||
    scope.length < 1 ||
    scope.length > (prepaid ? 40 : 4) ||
    !scope.some(
      (r) =>
        r.templateId === s.templateId &&
        r.version === s.templateVersion &&
        r.mode === s.processingMode &&
        r.promptHash === x.promptHash,
    )
  )
    throw Error('STUDIO_LIVE_NOT_APPROVED');
  const max = Number(c.get('PRODUCT_STUDIO_MAX_REQUESTS'));
  if (!Number.isInteger(max) || max < 1 || max > (prepaid ? 200 : 4))
    throw Error('STUDIO_LIVE_REQUEST_LIMIT_INVALID');
  return x;
}
export function assertStudioLibrarySource(
  c: ConfigService,
  sourceHash: string,
  maskHash: string,
  mode?: string,
  referenceKind?: string,
) {
  const raw = c.get<string>('PRODUCT_STUDIO_APPROVED_SOURCES_JSON') ?? '[]';
  if (raw.length > 16000) throw Error('STUDIO_SOURCE_SCOPE_INVALID');
  const sources = JSON.parse(raw) as {
    sourceHash: string;
    maskHash?: string;
    referenceKind?: string;
  }[];
  const original = referenceKind === 'ORIGINAL_REFERENCE';
  if (original && mode !== 'GENERATIVE_3D_HERO') throw Error('STUDIO_ORIGINAL_REFERENCE_HERO_ONLY');
  if (
    !Array.isArray(sources) ||
    sources.length < 1 ||
    sources.length > (prepaidStudioEvidence(c) ? 64 : 4) ||
    sources.some(
      (s) =>
        !/^[a-f0-9]{64}$/.test(s.sourceHash) ||
        (s.referenceKind === 'ORIGINAL_REFERENCE'
          ? s.maskHash != null
          : !/^[a-f0-9]{64}$/.test(s.maskHash ?? '')),
    ) ||
    !sources.some(
      (s) =>
        s.sourceHash === sourceHash &&
        (original
          ? s.referenceKind === 'ORIGINAL_REFERENCE' && s.maskHash == null
          : s.referenceKind !== 'ORIGINAL_REFERENCE' && s.maskHash === maskHash),
    )
  )
    throw Error('STUDIO_SOURCE_NOT_APPROVED');
}
export function studioLibraryCostView(c: ConfigService) {
  const mock = (c.get('PRODUCT_STUDIO_PROVIDER') ?? 'mock') === 'mock';
  if (mock)
    return {
      provider: 'mock',
      generationEnabled:
        c.get('PRODUCT_STUDIO_ENABLED') === 'true' &&
        c.get('PRODUCT_STUDIO_MOCK_APPROVED') === 'true',
      kind: 'MOCK_WORKFLOW_ONLY',
      currency: 'USD',
      reservedCeilingUsd: '0',
      actualCharge: 'NOT_A_PROVIDER_RESULT',
    };
  try {
    const p = reviewedStudioPricing(c);
    const prepaid = prepaidStudioEvidence(c);
    return {
      provider: 'fal',
      fundingPolicy: prepaid ? 'VERIFIED_PREPAID_QA_EXPERIMENT' : 'LEGACY_LIMITED_PILOT',
      balanceObservedUsd: prepaid?.balanceUsd ?? null,
      balanceObservedAt: prepaid?.observedAt ?? null,
      automaticTopUp: prepaid ? false : 'UNVERIFIED',
      generationEnabled: STUDIO_TEMPLATES.some((t) =>
        t.supportedModes.some((mode) => {
          try {
            assertStudioLibraryApproved(c, {
              templateId: t.id,
              templateVersion: t.version,
              processingMode: mode,
            });
            return true;
          } catch {
            return false;
          }
        }),
      ),
      kind: 'REVIEWED_CONSERVATIVE_RESERVATION_NOT_CHARGE',
      currency: 'USD',
      reservedCeilingUsd: p.reserve.toString(),
      reviewedAt: p.record.reviewedAt,
      quoteEvidenceId: p.record.evidenceId,
      actualCharge: 'UNKNOWN_UNTIL_RECONCILED',
    };
  } catch {
    return {
      provider: 'fal',
      generationEnabled: false,
      kind: 'REVIEWED_PRICING_REQUIRED',
      currency: 'USD',
      reservedCeilingUsd: null,
      actualCharge: 'UNKNOWN',
    };
  }
}
