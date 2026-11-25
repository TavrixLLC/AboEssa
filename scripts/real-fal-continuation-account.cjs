// Read-only account check; no inference, permission changes, recharge or retries.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const id = randomUUID().slice(0, 8);
const dir = path.join(root, 'docs/benchmarks/real-fal-continuation', id);
fs.mkdirSync(dir, { recursive: true });
const key = fs.readFileSync('D:/rezona-phase7-2-qa/fal-pilot/backend.env', 'utf8')
  .split(/\r?\n/).find(s => s.startsWith('FAL_KEY='))?.slice(8).trim();
if (!key) throw Error('BACKEND_KEY_MISSING');
(async () => {
  const response = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: 'Key ' + key },
  });
  let balanceUsd = null;
  let currency = null;
  if (response.ok) {
    const body = await response.text();
    if (body.length > 16000) throw Error('ACCOUNT_RESPONSE_TOO_LARGE');
    const value = JSON.parse(body);
    if (typeof value.credits?.current_balance === 'number' && Number.isFinite(value.credits.current_balance))
      balanceUsd = String(value.credits.current_balance);
    if (value.credits?.currency === 'USD') currency = 'USD';
  } else await response.body?.cancel();
  const result = {
    observedAt: new Date().toISOString(), method: 'GET',
    endpoint: 'https://api.fal.ai/v1/account/billing?expand=credits',
    status: response.status, balanceUsd, currency,
    autoTopUp: 'NOT_VERIFIED_BY_THIS_ENDPOINT',
    inferenceRequests: 0, permissionsExpanded: false,
    decision: 'NO_PAID_DISPATCH_WITHOUT_CURRENT_BALANCE_AND_TOPUP_VERIFICATION',
  };
  fs.writeFileSync(path.join(dir, 'account-readonly.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ ...result, evidenceDirectory: dir }));
})().catch(() => {
  const failure = { at: new Date().toISOString(), code: 'READ_ONLY_ACCOUNT_CHECK_FAILED', inferenceRequests: 0, permissionsExpanded: false };
  fs.writeFileSync(path.join(dir, 'failure.json'), JSON.stringify(failure, null, 2), { flag: 'wx' });
  console.error(JSON.stringify(failure)); process.exitCode = 1;
});
