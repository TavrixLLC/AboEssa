-- Additive, private drafts. No legacy product/order/media rows are rewritten.
CREATE TYPE "ProductIntakeStatus" AS ENUM ('DRAFT','COMPLETED','CANCELLED');
CREATE TYPE "ProductIntakeMode" AS ENUM ('NEW','STOCK_IN');
CREATE TYPE "IntakeUploadStatus" AS ENUM ('UPLOADING','READY','FAILED');
ALTER TABLE "FileAsset" ADD COLUMN "intakePrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FileAsset" ADD COLUMN "intakeProductId" TEXT REFERENCES "ProductListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "FileAsset_intakeProductId_idx" ON "FileAsset"("intakeProductId");
CREATE TABLE "ProductIntakeSession" (
 "id" TEXT PRIMARY KEY,
 "createdById" TEXT NOT NULL REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "clientDraftId" TEXT NOT NULL,
 "submissionOperationKey" TEXT NOT NULL UNIQUE,
 "status" "ProductIntakeStatus" NOT NULL DEFAULT 'DRAFT',
 "mode" "ProductIntakeMode" NOT NULL DEFAULT 'NEW',
 "revision" INTEGER NOT NULL DEFAULT 0 CHECK (revision>=0),
 "approvedMetadata" JSONB NOT NULL DEFAULT '{}',"recognizedMetadata" JSONB,
 "quantity" INTEGER CHECK (quantity BETWEEN 1 AND 1000000),
 "locationId" TEXT REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "existingProductId" TEXT REFERENCES "ProductListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "selectedImageKey" TEXT,
 "completedProductId" TEXT REFERENCES "ProductListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "completedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ProductIntakeSession_completion" CHECK ((status='COMPLETED')=("completedAt" IS NOT NULL AND "completedProductId" IS NOT NULL))
);
CREATE UNIQUE INDEX "ProductIntakeSession_createdById_clientDraftId_key" ON "ProductIntakeSession"("createdById","clientDraftId");
CREATE INDEX "ProductIntakeSession_createdById_status_updatedAt_id_idx" ON "ProductIntakeSession"("createdById",status,"updatedAt",id);
CREATE INDEX "ProductIntakeSession_status_updatedAt_id_idx" ON "ProductIntakeSession"(status,"updatedAt",id);
CREATE TABLE "ProductIntakeImage" (
 "id" TEXT PRIMARY KEY,
 "sessionId" TEXT NOT NULL REFERENCES "ProductIntakeSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "clientImageId" TEXT NOT NULL,"requestHash" TEXT NOT NULL,"storageKey" TEXT NOT NULL,
 "assetId" TEXT UNIQUE REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" "IntakeUploadStatus" NOT NULL DEFAULT 'UPLOADING',"lastErrorCode" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ProductIntakeImage_ready" CHECK (status<>'READY' OR "assetId" IS NOT NULL)
);
CREATE UNIQUE INDEX "ProductIntakeImage_sessionId_clientImageId_key" ON "ProductIntakeImage"("sessionId","clientImageId");
CREATE INDEX "ProductIntakeImage_status_updatedAt_id_idx" ON "ProductIntakeImage"(status,"updatedAt",id);
