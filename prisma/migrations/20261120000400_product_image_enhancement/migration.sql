-- AlterTable
ALTER TABLE "ProductIntakeSession" ADD COLUMN     "mediaRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RecognitionUsage" ADD COLUMN     "enhancementJobId" TEXT,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'RECOGNITION',
ADD COLUMN     "usageDetails" JSONB,
ALTER COLUMN "taskId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ProductImageEnhancementJob" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "recipeVersion" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelRevision" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "nextDispatchAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerRequestId" TEXT,
    "errorCode" TEXT,
    "metrics" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImageEnhancementJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImageEnhancementRequest" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImageEnhancementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImageEnhancementCandidate" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "qualityStatus" TEXT NOT NULL,
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImageEnhancementCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImageEnhancementDecision" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetCandidateId" TEXT,
    "selectedCandidateId" TEXT,
    "revision" INTEGER NOT NULL,
    "businessRevision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImageEnhancementDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductImageEnhancementJob_identityKey_key" ON "ProductImageEnhancementJob"("identityKey");

-- CreateIndex
CREATE INDEX "ProductImageEnhancementJob_status_nextDispatchAt_id_idx" ON "ProductImageEnhancementJob"("status", "nextDispatchAt", "id");

-- CreateIndex
CREATE INDEX "ProductImageEnhancementJob_sessionId_imageId_createdAt_id_idx" ON "ProductImageEnhancementJob"("sessionId", "imageId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImageEnhancementRequest_sessionId_requestKey_key" ON "ProductImageEnhancementRequest"("sessionId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImageEnhancementCandidate_jobId_key" ON "ProductImageEnhancementCandidate"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImageEnhancementCandidate_assetId_key" ON "ProductImageEnhancementCandidate"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImageEnhancementDecision_sessionId_requestKey_key" ON "ProductImageEnhancementDecision"("sessionId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImageEnhancementDecision_sessionId_revision_key" ON "ProductImageEnhancementDecision"("sessionId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "RecognitionUsage_enhancementJobId_attempt_key" ON "RecognitionUsage"("enhancementJobId", "attempt");

-- AddForeignKey
ALTER TABLE "RecognitionUsage" ADD CONSTRAINT "RecognitionUsage_enhancementJobId_fkey" FOREIGN KEY ("enhancementJobId") REFERENCES "ProductImageEnhancementJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageEnhancementJob" ADD CONSTRAINT "ProductImageEnhancementJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProductIntakeSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageEnhancementJob" ADD CONSTRAINT "ProductImageEnhancementJob_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ProductIntakeImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageEnhancementRequest" ADD CONSTRAINT "ProductImageEnhancementRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProductIntakeSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageEnhancementRequest" ADD CONSTRAINT "ProductImageEnhancementRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ProductImageEnhancementJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageEnhancementCandidate" ADD CONSTRAINT "ProductImageEnhancementCandidate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ProductImageEnhancementJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageEnhancementCandidate" ADD CONSTRAINT "ProductImageEnhancementCandidate_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageEnhancementDecision" ADD CONSTRAINT "ProductImageEnhancementDecision_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProductIntakeSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageEnhancementDecision" ADD CONSTRAINT "ProductImageEnhancementDecision_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ProductIntakeImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageEnhancementDecision" ADD CONSTRAINT "ProductImageEnhancementDecision_selectedCandidateId_fkey" FOREIGN KEY ("selectedCandidateId") REFERENCES "ProductImageEnhancementCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One authoritative ledger: an entry belongs to recognition XOR image editing.
ALTER TABLE "RecognitionUsage" ADD CONSTRAINT "RecognitionUsage_purpose_reference_check" CHECK (("purpose" = 'RECOGNITION' AND "taskId" IS NOT NULL AND "enhancementJobId" IS NULL) OR ("purpose" = 'IMAGE_EDIT' AND "taskId" IS NULL AND "enhancementJobId" IS NOT NULL));
ALTER TABLE "ProductImageEnhancementJob" ADD CONSTRAINT "Enhancement_bounds_check" CHECK ("generation" BETWEEN 0 AND 2 AND "attempts" BETWEEN 0 AND 3 AND "mode" IN ('CLEAN','BACKGROUND_REMOVE','STUDIO_COMPOSITE','AI_ENHANCE') AND "status" IN ('PENDING','PROCESSING','COMPLETED','FAILED','UNKNOWN','CANCELLED'));
