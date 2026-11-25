// SYNTHETIC LEDGER ARITHMETIC ONLY. No provider, network request or actual secret instantiated.
if (process.env.REZONA_PHASE7_QA !== '1') throw Error('Explicit Phase7 QA only');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client'), { ConfigService } = require('@nestjs/config');
const { RecognitionBudgetService } = require('../dist/src/ai/recognition-budget.service');
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://phase7_qa:phase7-local-only@127.0.0.1:55450/rezona_phase7_qa' } } });
(async()=>{
  await db.recognitionUsage.updateMany({where:{purpose:'IMAGE_EDIT',actorId:{startsWith:'synthetic-P7-'},enhancementJob:{errorCode:'SYNTHETIC_LEDGER_TEST'}},data:{status:'SYNTHETIC_LEDGER_TEST',committedUsd:0,errorCode:'QA_NO_EXTERNAL_CALL'}});
  const source = await db.productIntakeImage.findFirstOrThrow({ where: { status: 'READY' } }), actor = 'synthetic-P7-' + randomUUID();
  const c = new ConfigService({ AI_RECOGNITION_PROVIDER:'gemini', AI_MODEL_REVISION:'synthetic-reviewed', GEMINI_API_KEY:'fake-never-used', AI_LIVE_CALLS_APPROVED:'true', AI_PAID_DATA_TERMS_ACCEPTED:'true', AI_ACCOUNT_MODEL_VERIFIED:'gemini-3.1-flash-lite', AI_PROVIDER_REVIEWED_AT:new Date().toISOString(), AI_MONTHLY_BUDGET_USD:'.50', AI_DAILY_BUDGET_USD:'.50', AI_INPUT_USD_PER_MILLION:'0.25', AI_OUTPUT_USD_PER_MILLION:'1.50', AI_RECOGNITION_CONCURRENCY:'2', AI_DAILY_REQUEST_LIMIT:'10000', AI_EMPLOYEE_DAILY_LIMIT:'1000', AI_MODEL_DAILY_LIMIT:'10000', AI_EMPLOYEE_HOURLY_LIMIT:'100', IMAGE_AI_ENABLED:'true', IMAGE_AI_PROVIDER:'fal', IMAGE_AI_MODEL_REVISION:'synthetic-reviewed', IMAGE_AI_LIVE_APPROVED:'true', IMAGE_AI_DATA_TERMS_ACCEPTED:'true', IMAGE_AI_ACCOUNT_MODEL_VERIFIED:'blackforestlabs/flux-3/klein/edit-image', IMAGE_AI_PROVIDER_REVIEWED_AT:new Date().toISOString(), IMAGE_AI_MONTHLY_BUDGET_USD:'0.50', IMAGE_AI_DAILY_BUDGET_USD:'0.50', IMAGE_AI_MAX_REQUEST_USD:'0.20', IMAGE_AI_CONCURRENCY:'2', FAL_KEY:'fake-never-used' });
  // Config parser intentionally requires leading zero.
  c.set('AI_MONTHLY_BUDGET_USD','0.50'); c.set('AI_DAILY_BUDGET_USD','0.50');
  const service = new RecognitionBudgetService(db,c), usageIds=[];
  const task=await db.productRecognitionTask.create({data:{cacheKey:randomUUID(),sourceImageId:source.id,sourceHash:source.requestHash,actorId:actor,provider:'gemini',model:'gemini-3.1-flash-lite',modelRevision:'synthetic-reviewed',promptVersion:'synthetic',schemaVersion:'synthetic',taxonomyHash:'none',categorySnapshot:[],status:'FAILED',attempts:1,errorCode:'SYNTHETIC_LEDGER_TEST'}});
  const jobs=await Promise.all([0,1,2].map(generation=>db.productImageEnhancementJob.create({data:{sessionId:source.sessionId,imageId:source.id,actorId:actor,identityKey:randomUUID(),sourceHash:source.requestHash,mode:'AI_ENHANCE',background:'WHITE',recipeVersion:'QA_LEDGER_ONLY',provider:'fal',model:'blackforestlabs/flux-3/klein/edit-image',modelRevision:'synthetic-reviewed',promptVersion:'synthetic',generation,status:'FAILED',attempts:1,errorCode:'SYNTHETIC_LEDGER_TEST'}})));
  try {
    const recognition=await service.reserve(task); usageIds.push(recognition.id); assert.equal(recognition.reservedUsd.toString(),'0.360448');
    await assert.rejects(service.reserveImage(jobs[0]),/AI_BUDGET_EXCEEDED/); // fal cannot bypass Gemini's shared ledger.
    await service.releaseBeforeDispatch(recognition.id,'QA_NO_DISPATCH');
    const reservations=await Promise.allSettled(jobs.map(j=>service.reserveImage(j)));
    assert.equal(reservations.filter(r=>r.status==='fulfilled').length,2); assert.ok(['AI_BUDGET_EXCEEDED','AI_CONCURRENCY_LIMIT'].includes(reservations.find(r=>r.status==='rejected').reason.message));
    const wins=reservations.filter(r=>r.status==='fulfilled').map(r=>r.value); usageIds.push(...wins.map(x=>x.id));
    await service.settleImage(wins[0].id,false,100,{test:'synthetic'},'QA_SIMULATED_TIMEOUT');
    const unknown=await db.recognitionUsage.findUniqueOrThrow({where:{id:wins[0].id}}); assert.equal(unknown.status,'UNKNOWN'); assert.equal(unknown.committedUsd.toString(),'0.2'); assert.equal(unknown.actualBilledUsd,null);
    await service.settleImage(wins[1].id,true,100,{test:'synthetic'});
    const report=await db.recognitionUsage.findUniqueOrThrow({where:{id:wins[1].id}}); assert.equal(report.committedUsd.toString(),'0.2'); assert.equal(report.estimatedUsd,null); assert.equal(report.actualBilledUsd,null);
    await assert.rejects(service.reserveImage(jobs.find(j=>!wins.some(w=>w.enhancementJobId===j.id))),/AI_BUDGET_EXCEEDED/);
    await assert.rejects(service.reserveImage(jobs.find(j=>j.id===wins[0].enhancementJobId)),/AI_ATTEMPT_ALREADY_RESERVED/);
    // DB XOR reference constraint also protects the shared ledger from orphan/fake-purpose rows.
    await assert.rejects(db.recognitionUsage.create({data:{actorId:actor,provider:'fal',model:'test',purpose:'IMAGE_EDIT',attempt:1,reservedUsd:0,inputRateUsd:0,outputRateUsd:0,committedUsd:0}}));
    const result={time:new Date().toISOString(),passed:true,externalRequests:0,actualCharges:'NOT_APPLICABLE',scope:'Synthetic isolated shared PostgreSQL Decimal/advisory-lock arithmetic. Fake authorization config; NO editing/recognition provider instance.',checks:['Gemini recognition reservation blocks fal overspend under the same shared cap','Three concurrent 0.20 requests against 0.50 yield exactly two reservations','UNKNOWN retains full reservation; successful image estimate not fabricated','One reservation per attempt; ledger purpose/reference XOR enforced','Local CLEAN makes no usage reservation (verified in HTTP checks)']};
    fs.writeFileSync(path.resolve(__dirname,'../docs/benchmarks/phase7/budget.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
  } finally { await db.recognitionUsage.updateMany({where:{actorId:actor},data:{status:'SYNTHETIC_LEDGER_TEST',committedUsd:0,errorCode:'QA_NO_EXTERNAL_CALL'}}); }
})().finally(()=>db.$disconnect()).catch(e=>{console.error(e);process.exitCode=1;});
