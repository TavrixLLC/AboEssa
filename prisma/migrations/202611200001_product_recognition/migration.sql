-- Additive Phase 6 only. Deliberately excludes unrelated legacy schema drift.
CREATE TYPE "RecognitionTaskStatus" AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED','UNKNOWN');
CREATE TYPE "RecognitionRequestStatus" AS ENUM ('ACTIVE','CANCELLED','SUPERSEDED');
CREATE TABLE "ProductRecognitionTask" (
 "id" TEXT PRIMARY KEY,"cacheKey" TEXT NOT NULL,"sourceImageId" TEXT NOT NULL,
 "sourceHash" TEXT NOT NULL,"actorId" TEXT NOT NULL,"provider" TEXT NOT NULL,"model" TEXT NOT NULL,
 "promptVersion" TEXT NOT NULL,"schemaVersion" TEXT NOT NULL,"taxonomyHash" TEXT NOT NULL,
 "categorySnapshot" JSONB NOT NULL,"status" "RecognitionTaskStatus" NOT NULL DEFAULT 'PENDING',
 "attempts" INTEGER NOT NULL DEFAULT 0,"leaseToken" TEXT,"nextDispatchAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "result" JSONB,"warnings" JSONB,"errorCode" TEXT,"startedAt" TIMESTAMP(3),"completedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ProductRecognitionTask_sourceImageId_fkey" FOREIGN KEY ("sourceImageId") REFERENCES "ProductIntakeImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "RecognitionTask_attempts_check" CHECK ("attempts">=0 AND "attempts"<=3)
);
CREATE UNIQUE INDEX "ProductRecognitionTask_cacheKey_key" ON "ProductRecognitionTask"("cacheKey");
CREATE INDEX "ProductRecognitionTask_status_nextDispatchAt_id_idx" ON "ProductRecognitionTask"("status","nextDispatchAt","id");
CREATE TABLE "ProductRecognitionRequest" (
 "id" TEXT PRIMARY KEY,"sessionId" TEXT NOT NULL,"imageId" TEXT NOT NULL,"taskId" TEXT NOT NULL,"actorId" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL,"generation" INTEGER NOT NULL DEFAULT 0,"status" "RecognitionRequestStatus" NOT NULL DEFAULT 'ACTIVE',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ProductRecognitionRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProductIntakeSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ProductRecognitionRequest_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ProductIntakeImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ProductRecognitionRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProductRecognitionTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "RecognitionRequest_generation_check" CHECK ("generation" BETWEEN 0 AND 2)
);
CREATE UNIQUE INDEX "ProductRecognitionRequest_sessionId_requestKey_key" ON "ProductRecognitionRequest"("sessionId","requestKey");
CREATE INDEX "ProductRecognitionRequest_sessionId_createdAt_id_idx" ON "ProductRecognitionRequest"("sessionId","createdAt","id");
CREATE INDEX "ProductRecognitionRequest_taskId_status_idx" ON "ProductRecognitionRequest"("taskId","status");
CREATE TABLE "RecognitionUsage" (
 "id" TEXT PRIMARY KEY,"taskId" TEXT NOT NULL,"actorId" TEXT NOT NULL,"provider" TEXT NOT NULL,"model" TEXT NOT NULL,
 "attempt" INTEGER NOT NULL,"status" TEXT NOT NULL DEFAULT 'RESERVED',"reservedUsd" DECIMAL(18,9) NOT NULL,
 "inputRateUsd" DECIMAL(18,9) NOT NULL,"outputRateUsd" DECIMAL(18,9) NOT NULL,"committedUsd" DECIMAL(18,9) NOT NULL,
 "estimatedUsd" DECIMAL(18,9),"actualBilledUsd" DECIMAL(18,9),"inputTokens" INTEGER,"outputTokens" INTEGER,"thinkingTokens" INTEGER,
 "latencyMs" INTEGER,"errorCode" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"completedAt" TIMESTAMP(3),
 CONSTRAINT "RecognitionUsage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProductRecognitionTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "RecognitionUsage_nonnegative" CHECK ("reservedUsd">=0 AND "committedUsd">=0 AND "inputRateUsd">=0 AND "outputRateUsd">=0)
);
CREATE UNIQUE INDEX "RecognitionUsage_taskId_attempt_key" ON "RecognitionUsage"("taskId","attempt");
CREATE INDEX "RecognitionUsage_provider_createdAt_idx" ON "RecognitionUsage"("provider","createdAt");
CREATE INDEX "RecognitionUsage_actorId_createdAt_idx" ON "RecognitionUsage"("actorId","createdAt");
CREATE INDEX "RecognitionUsage_model_createdAt_idx" ON "RecognitionUsage"("model","createdAt");
CREATE TABLE "IntakeDuplicateDecision" (
 "id" TEXT PRIMARY KEY,"sessionId" TEXT NOT NULL,"revision" INTEGER NOT NULL,"identityHash" TEXT NOT NULL,
 "candidatesHash" TEXT NOT NULL,"action" TEXT NOT NULL,"actorId" TEXT NOT NULL,"reason" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "IntakeDuplicateDecision_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProductIntakeSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IntakeDuplicateDecision_sessionId_key" ON "IntakeDuplicateDecision"("sessionId");
