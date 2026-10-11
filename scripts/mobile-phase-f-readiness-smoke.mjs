/** Read-only Phase F runtime smoke. Targets local AboEssa API only. */
const baseUrl = (process.env.API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
if (!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(baseUrl)) {
  throw new Error('API_BASE_URL must target local AboEssa only');
}

let passed = 0;
let failed = 0;

async function check(name, action) {
  try {
    await action();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

async function response(path, init) {
  return fetch(`${baseUrl}${path}`, init);
}

await check('liveness', async () => {
  const result = await response('/health');
  if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
});

await check('readiness', async () => {
  const result = await response('/ready');
  if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
  const body = await result.json();
  const data = body?.data ?? body;
  if (data?.ready !== true || data?.dependencies?.database !== 'ok' || data?.dependencies?.redis !== 'ok') {
    throw new Error('dependency readiness is not healthy');
  }
});

await check('device registration requires authentication', async () => {
  const result = await response('/api/customer/devices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      installationId: 'smoke-installation-123456',
      platform: 'ANDROID',
      token: 'smoke-token-never-persisted',
      preferredLocale: 'ar',
    }),
  });
  if (result.status !== 401) throw new Error(`expected 401, got ${result.status}`);
});

let document;
await check('OpenAPI device contract', async () => {
  const result = await response('/api/docs-json');
  if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
  document = await result.json();
  if (!document?.paths?.['/api/customer/devices']?.post) throw new Error('registration path absent');
  if (!document?.paths?.['/api/customer/devices/{installationId}']?.delete) {
    throw new Error('unregistration path absent');
  }
});

await check('OpenAPI delivery aggregate contract', async () => {
  const text = JSON.stringify(document);
  for (const field of ['pushQueuedCount', 'pushSuccessCount', 'pushFailureCount', 'noDeviceCount']) {
    if (!text.includes(`"${field}"`)) throw new Error(`${field} absent`);
  }
});

await check('Live API remains absent', async () => {
  const result = await response('/api/live');
  if (result.status !== 404) throw new Error(`expected 404, got ${result.status}`);
});

await check('Live notification destination remains absent from OpenAPI', async () => {
  const schemas = document?.components?.schemas ?? {};
  const notificationSchemas = Object.fromEntries(
    Object.entries(schemas).filter(([name]) => /AdminNotification|NotificationLink/i.test(name)),
  );
  const text = JSON.stringify(notificationSchemas);
  if (text.includes('"LIVE"')) throw new Error('Live notification destination detected');
});

console.log(JSON.stringify({ passed, failed, skipped: 0 }));
if (failed > 0) process.exitCode = 1;
