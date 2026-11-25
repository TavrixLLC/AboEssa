-- Additive media-only extension. Original captures, decisions and inventory remain untouched.
ALTER TABLE "ProductImageEnhancementJob" ADD COLUMN "parameters" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "ProductImageEnhancementCandidate" ADD COLUMN "processingDetails" JSONB,
  ADD COLUMN "maskAssetId" TEXT;
CREATE UNIQUE INDEX "ProductImageEnhancementCandidate_maskAssetId_key" ON "ProductImageEnhancementCandidate"("maskAssetId");
ALTER TABLE "ProductImageEnhancementCandidate" ADD CONSTRAINT "ProductImageEnhancementCandidate_maskAssetId_fkey"
  FOREIGN KEY ("maskAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductImageEnhancementJob" DROP CONSTRAINT "Enhancement_bounds_check";
ALTER TABLE "ProductImageEnhancementJob" ADD CONSTRAINT "Enhancement_bounds_check" CHECK (
  "generation" BETWEEN 0 AND 2 AND "attempts" BETWEEN 0 AND 3
  AND "mode" IN ('CLEAN','BACKGROUND_REMOVE','STUDIO_COMPOSITE','AI_ENHANCE','NEURAL_BACKGROUND_REMOVE')
  AND "status" IN ('PENDING','PROCESSING','COMPLETED','FAILED','UNKNOWN','CANCELLED'));
