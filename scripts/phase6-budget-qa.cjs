// Synthetic financial-ledger test ONLY. No provider, fetch or SDK is instantiated.
if (process.env.REZONA_PHASE6_QA !== '1') throw Error('Explicit Phase6 QA required');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client'),
  { ConfigService } = require('@nestjs/config');
const { RecognitionBudgetService } = require('../dist/src/ai/recognition-budget.service');
const db = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://phase6_qa:phase6-local-only@127.0.0.1:55448/rezona_phase6_qa' },
  },
});
const config = new ConfigService({
  AI_RECOGNITION_PROVIDER: 'gemini',
  AI_MODEL_REVISION: 'synthetic-no-provider-call',
  GEMINI_API_KEY: 'not-a-real-key',
  AI_LIVE_CALLS_APPROVED: 'true',
  AI_PAID_DATA_TERMS_ACCEPTED: 'true',
  AI_ACCOUNT_MODEL_VERIFIED: 'gemini-3.1-flash-lite',
  AI_PROVIDER_REVIEWED_AT: new Date().toISOString(),
  AI_MONTHLY_BUDGET_USD: '0.50',
  AI_DAILY_BUDGET_USD: '0.50',
  AI_INPUT_USD_PER_MILLION: '0.25',
  AI_OUTPUT_USD_PER_MILLION: '1.50',
  AI_RECOGNITION_CONCURRENCY: '2',
  AI_DAILY_REQUEST_LIMIT: '10000',
  AI_EMPLOYEE_DAILY_LIMIT: '1000',
  AI_MODEL_DAILY_LIMIT: '10000',
  AI_EMPLOYEE_HOURLY_LIMIT: '100',
});
(async () => {
  // Separate synthetic accounting period prevents previous QA ledger runs from affecting the cap.
  const source = await db.productIntakeImage.findFirstOrThrow({ where: { status: 'READY' } }),
    actor = 'synthetic-budget-' + randomUUID();
  const model = 'QA_LEDGER_ONLY_' + randomUUID(),
    service = new RecognitionBudgetService(db, config);
  const tasks = await Promise.all(
    [1, 2].map((n) =>
      db.productRecognitionTask.create({
        data: {
          cacheKey: randomUUID(),
          sourceImageId: source.id,
          sourceHash: source.requestHash,
          actorId: actor,
          provider: 'gemini',
          model,
          modelRevision: 'SYNTHETIC_NO_PROVIDER',
          promptVersion: 'budget-ledger-test',
          schemaVersion: 'budget-ledger-test',
          taxonomyHash: 'none',
          categorySnapshot: [],
          status: 'FAILED',
          attempts: 1,
          errorCode: 'QA_LEDGER_ONLY',
        },
      }),
    ),
  );
  const results = await Promise.allSettled(tasks.map((t) => service.reserve(t)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected');
  assert.equal(rejected.reason.message, 'AI_BUDGET_EXCEEDED');
  const usage = results.find((r) => r.status === 'fulfilled').value;
  assert.equal(usage.reservedUsd.toString(), '0.360448');
  await service.settle(usage.id, null, 20, 'QA_SIMULATED_TIMEOUT');
  const ambiguous = await db.recognitionUsage.findUniqueOrThrow({ where: { id: usage.id } });
  assert.equal(ambiguous.status, 'UNKNOWN');
  assert.equal(ambiguous.committedUsd.toString(), '0.360448');
  assert.equal(ambiguous.actualBilledUsd, null);
  const losingTask = tasks.find((t) => t.id !== usage.taskId);
  await assert.rejects(service.reserve(losingTask), /AI_BUDGET_EXCEEDED/);
  await service.settle(
    usage.id,
    { value: {}, inputTokens: 1000, outputTokens: 200, thinkingTokens: 300 },
    20,
  );
  const reported = await db.recognitionUsage.findUniqueOrThrow({ where: { id: usage.id } });
  assert.equal(reported.estimatedUsd.toString(), '0.001');
  assert.equal(reported.actualBilledUsd, null);
  // Clearly mark the records; these are not real provider usage or expense.
  await db.recognitionUsage.update({
    where: { id: usage.id },
    data: { status: 'SYNTHETIC_LEDGER_TEST', committedUsd: 0, errorCode: 'QA_NO_EXTERNAL_CALL' },
  });
  const result = {
    time: new Date().toISOString(),
    passed: true,
    externalRequests: 0,
    actualCharges: 'NOT_APPLICABLE',
    scope:
      'Synthetic isolated PostgreSQL budget arithmetic/concurrency. Fake approval config; no provider instance.',
    checks: [
      'Concurrent reservations serialized: one 0.360448 reservation fits 0.50; the second is rejected',
      'Timeout retains entire reservation; cannot spend uncertain budget twice',
      'Thinking tokens included using snapshotted rates',
      'Reported token arithmetic yields estimate 0.001, never an actual charge',
    ],
    taskIds: tasks.map((t) => t.id),
  };
  fs.writeFileSync(
    path.resolve(__dirname, '../docs/benchmarks/phase6/budget.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
})()
  .finally(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
