-- Static templates are code-backed; no prompt table or inventory migration.
ALTER TABLE "ProductIntakeSession" ADD COLUMN "imageDecisionRevision" INTEGER NOT NULL DEFAULT 0;
UPDATE "ProductIntakeSession" s SET "imageDecisionRevision"=GREATEST(s."mediaRevision",
 COALESCE((SELECT MAX(d.revision) FROM "ProductImageEnhancementDecision" d WHERE d."sessionId"=s.id),0));
ALTER TABLE "ProductIntakeSession" ADD CONSTRAINT "Intake_image_decision_revision_check" CHECK ("imageDecisionRevision">=0);
ALTER TABLE "ProductImageEnhancementCandidate" ADD COLUMN "mediaRole" TEXT NOT NULL DEFAULT 'FACTUAL';
UPDATE "ProductImageEnhancementCandidate" c SET "mediaRole"='AI_PROMOTIONAL'
FROM "ProductImageEnhancementJob" j WHERE c."jobId"=j.id AND j.mode='PREMIUM_3D_STUDIO';
ALTER TABLE "ProductImageEnhancementCandidate" ADD CONSTRAINT "Enhancement_media_role_check"
CHECK ("mediaRole" IN ('FACTUAL','AI_PROMOTIONAL'));
ALTER TABLE "ProductImageEnhancementJob" DROP CONSTRAINT "Enhancement_bounds_check";
ALTER TABLE "ProductImageEnhancementJob" ADD CONSTRAINT "Enhancement_bounds_check" CHECK (
 "generation" BETWEEN 0 AND 2 AND "attempts" BETWEEN 0 AND 3
 AND "mode" IN ('CLEAN','BACKGROUND_REMOVE','STUDIO_COMPOSITE','AI_ENHANCE','NEURAL_BACKGROUND_REMOVE','GEMINI_BRAND_STUDIO','PREMIUM_3D_STUDIO','PRODUCT_STUDIO_FAITHFUL','PRODUCT_STUDIO_HERO')
 AND "status" IN ('PENDING','PROCESSING','COMPLETED','FAILED','UNKNOWN','CANCELLED')
);
