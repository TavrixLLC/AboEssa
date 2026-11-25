import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

export function aiSettings(c: ConfigService) {
  const n = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(c.get(key) ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error('AI_INVALID_CONFIG');
    return value;
  };
  const money = (key: string, fallback: string) => {
    const raw = String(c.get(key) ?? fallback);
    if (!/^\d{1,6}(\.\d{1,9})?$/.test(raw)) throw new Error('AI_INVALID_CONFIG');
    return new Prisma.Decimal(raw);
  };
  const provider = c.get<string>('AI_RECOGNITION_PROVIDER') ?? 'mock';
  const model = c.get<string>('AI_RECOGNITION_MODEL') ?? 'gemini-3.1-flash-lite';
  if (
    !['mock', 'gemini'].includes(provider) ||
    !['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'].includes(model)
  )
    throw new Error('AI_INVALID_PROVIDER_CONFIG');
  return {
    enabled: c.get<string>('AI_RECOGNITION_ENABLED') === 'true',
    provider,
    model,
    modelRevision:
      c.get<string>('AI_MODEL_REVISION') ?? (provider === 'mock' ? 'mock-v1' : 'UNVERIFIED'),
    concurrency: n('AI_RECOGNITION_CONCURRENCY', 1, 1, 2),
    daily: n('AI_DAILY_REQUEST_LIMIT', 100, 1, 10000),
    employeeDaily: n('AI_EMPLOYEE_DAILY_LIMIT', 30, 1, 1000),
    modelDaily: n('AI_MODEL_DAILY_LIMIT', 100, 1, 10000),
    hourly: n('AI_EMPLOYEE_HOURLY_LIMIT', 10, 1, 100),
    monthly: money('AI_MONTHLY_BUDGET_USD', '0'),
    dailyBudget: money('AI_DAILY_BUDGET_USD', '0'),
    inputRate: money('AI_INPUT_USD_PER_MILLION', '0'),
    outputRate: money('AI_OUTPUT_USD_PER_MILLION', '0'),
    // Reserve the entire documented context + output ceiling, not a guessed image token count.
    inputCeiling: 1048576,
    outputCeiling: 65536,
    timeoutMs: n('AI_REQUEST_TIMEOUT_MS', 25000, 1000, 45000),
    maxOutputTokens: 2048,
  };
}
export function assertGeminiApproved(c: ConfigService) {
  const s = aiSettings(c),
    reviewed = Date.parse(c.get<string>('AI_PROVIDER_REVIEWED_AT') ?? '');
  if (
    c.get<string>('AI_LIVE_CALLS_APPROVED') !== 'true' ||
    c.get<string>('AI_PAID_DATA_TERMS_ACCEPTED') !== 'true' ||
    c.get<string>('AI_ACCOUNT_MODEL_VERIFIED') !== s.model ||
    s.modelRevision === 'UNVERIFIED' ||
    !/^[A-Za-z0-9_.-]{3,100}$/.test(s.modelRevision) ||
    !Number.isFinite(reviewed) ||
    reviewed > Date.now() ||
    Date.now() - reviewed > 7 * 86400000 ||
    !c.get<string>('GEMINI_API_KEY') ||
    s.monthly.lte(0) ||
    s.dailyBudget.lte(0) ||
    s.inputRate.lt(s.model === 'gemini-3.1-flash-lite' ? '0.25' : '0.30') ||
    s.outputRate.lt(s.model === 'gemini-3.1-flash-lite' ? '1.50' : '2.50')
  )
    throw new Error('AI_LIVE_NOT_APPROVED');
}
