import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
export type PrepaidStudioEvidence = {
  approvalId: string;
  observedAt: string;
  balanceUsd: string;
  autoTopUp: false;
  plan: 'PAY_AS_YOU_GO';
  invoiceDueUsd: '0';
  prepaidOnly: true;
  noRecharge: true;
  evidenceId: string;
  historicalReservedUsd: string;
};
// Backend operator evidence only; never accepted from an HTTP body. No billing permissions are expanded.
export function prepaidStudioEvidence(c: ConfigService) {
  if (c.get('PRODUCT_STUDIO_PREPAID_EXPERIMENT') !== 'true') return null;
  const raw = c.get<string>('PRODUCT_STUDIO_PREPAID_EVIDENCE_JSON');
  if (!raw || raw.length > 2000) throw Error('STUDIO_PREPAID_VERIFICATION_REQUIRED');
  const p = JSON.parse(raw) as PrepaidStudioEvidence,
    at = Date.parse(p.observedAt);
  let qa = false;
  try {
    const u = new URL(c.get<string>('DATABASE_URL') ?? '');
    qa =
      u.hostname === '127.0.0.1' &&
      u.port === '55456' &&
      /^\/rezona_real_studio_qa_[a-f0-9]{8}$/.test(u.pathname);
  } catch {
    /* fail closed */
  }
  if (
    !qa ||
    c.get('NODE_ENV') !== 'test' ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 3600000 ||
    !/^owner-prepaid-[a-f0-9]{8,64}$/.test(p.approvalId ?? '') ||
    !/^fal-account-review-[a-f0-9]{8,64}$/.test(p.evidenceId ?? '') ||
    !/^\d{1,2}(\.\d{1,9})?$/.test(p.balanceUsd ?? '') ||
    p.autoTopUp !== false ||
    p.plan !== 'PAY_AS_YOU_GO' ||
    p.invoiceDueUsd !== '0' ||
    p.prepaidOnly !== true ||
    p.noRecharge !== true ||
    !/^\d{1,2}(\.\d{1,9})?$/.test(p.historicalReservedUsd ?? '') ||
    new Prisma.Decimal(p.historicalReservedUsd).lt('1.044480') ||
    new Prisma.Decimal(p.balanceUsd).gt(10)
  )
    throw Error('STUDIO_PREPAID_VERIFICATION_INVALID');
  return {
    ...p,
    balance: new Prisma.Decimal(p.balanceUsd),
    carry: new Prisma.Decimal(p.historicalReservedUsd),
  };
}
