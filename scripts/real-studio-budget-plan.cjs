// Planning only; no key, account API, inference or ledger writes.
const fs = require('node:fs'),
  path = require('node:path'),
  { Prisma } = require('@prisma/client'),
  m = JSON.parse(fs.readFileSync('D:/rezona-real-studio-qa/manifest.json', 'utf8')),
  index = JSON.parse(fs.readFileSync(path.join(m.dir, 'review-index.json'), 'utf8'));
const eligible = ['P01', 'P02', 'P10', 'P12', 'P16'],
  conditional = ['P06'];
const per = new Prisma.Decimal(65536)
    .mul('.3125')
    .add(new Prisma.Decimal(4096).mul('37.50'))
    .div(1000000),
  prior = new Prisma.Decimal('1.044480');
const plan = {
  createdAt: new Date().toISOString(),
  paidAuthorized: false,
  actualPaidRequests: 0,
  actualNewSpendUsd: '0',
  publicPricingEvidence: {
    source: 'https://fal.ai/models/google/nano-banana-lite/edit',
    reviewDate: '2026-11-24',
    model: 'google/nano-banana-lite/edit',
    inputPerMillionUsd: '.3125',
    textOutputPerMillionUsd: '1.875',
    imageOutputPerMillionUsd: '37.50',
    fixedOutput: '1024x1024',
    method: 'PUBLIC_DOCUMENTATION_READ_ONLY_NO_ACCOUNT_KEY',
  },
  conservativePlanningAssumptions: {
    inputTokenCeiling: 65536,
    outputTokenCeiling: 4096,
    outputCeilingPricedAtHigherImageRate: true,
    maxGeneratedImages: 1,
    perRequestReserveUsd: per.toFixed(6),
    notAConfirmedCharge: true,
    notAProviderEnforcedMaximum: true,
    formalReviewedUnitQuoteConfigured: false,
  },
  proposed: index.photos
    .filter((p) => eligible.includes(p.tag))
    .map((p) => ({
      photoId: p.photoId,
      tag: p.tag,
      label: p.label,
      templateId: p.recommendedTemplateId,
      version: 1,
      mode: 'FAITHFUL_COMPOSITE',
      requests: 1,
      employeeMaskApproval: 'PENDING',
      privateTransferApproval: 'NOT_AUTHORIZED',
      planningReserveUsd: per.toFixed(6),
    })),
  conditionalExcluded: conditional.map((tag) => ({
    tag,
    reason:
      'Suitcase wheels/thin edges need close employee review before considering a paid test; LOCAL PREVIEW is not acceptance',
  })),
  fullProposedRequestCount: eligible.length,
  fullPlanningReserveUsd: per.mul(eligible.length).toFixed(6),
  fullyAuthorizedEligibleCount: 0,
  recommendedFirstPilot: {
    tags: ['P01', 'P10'],
    requestCount: 2,
    reserveUsd: per.mul(2).toFixed(6),
    authorization: 'NOT_GRANTED',
    reason:
      'One new electronics package and one new flat garment, only after source/mask/transfer/price/budget approval',
  },
  historical: {
    retainedCommitmentsUsd: prior.toFixed(6),
    totalActualSpend: 'UNKNOWN',
    soap422Correlation: 'PROVISIONAL',
    soap422Cause: 'UNRESOLVED',
    teclastWarm: 'UNKNOWN_DO_NOT_REDISPATCH',
    reservationsReleased: 0,
  },
  budgetAvailability: {
    accountBalance: 'NOT_READ_UNKNOWN',
    sharedRemainingBudget: 'UNKNOWN',
    monthlyCapUsd: '10',
    dailyCapUsd: '1.50',
    carryAccountingUnchanged: true,
    existingDailyAdmissionWithFullProposalUsd: prior.add(per.mul(eligible.length)).toFixed(6),
    existingDailyAdmissionWithFirstTwoUsd: prior.add(per.mul(2)).toFixed(6),
    fullBatchBlockedByExistingDailyGate: true,
    fullBatchAlsoExceedsExistingFourSourceScope: true,
    currentRealPhotoDatabaseNotInLiveProviderAllowlist: true,
  },
  preconditions: [
    'Employee approval of exact complete mask (not agent QA readiness)',
    'Explicit source/mask/template/version/mode and private-transfer consent',
    'Current reviewed provider pricing/quote record and billable-unit ceiling',
    'Read-only real account/shared-budget reconciliation retaining all UNKNOWN',
    'Separate fixed spend/request owner authorization; no automatic gate widening',
    'No automatic retries, no alternative models, no remaining unsafe photos',
  ],
};
fs.writeFileSync(
  path.join(m.out, 'proposed-paid-plan-NOT-AUTHORIZED.json'),
  JSON.stringify(plan, null, 2),
  { flag: 'wx' },
);
console.log(
  JSON.stringify({
    proposed: plan.fullProposedRequestCount,
    reserve: plan.fullPlanningReserveUsd,
    firstTwo: plan.recommendedFirstPilot.reserveUsd,
    authorized: 0,
    sharedBudget: 'UNKNOWN',
  }),
);
