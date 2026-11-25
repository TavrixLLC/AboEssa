-- Additive styling-mode extension only; no inventory, product or billing data rewrite.
ALTER TABLE "ProductImageEnhancementJob" DROP CONSTRAINT "Enhancement_bounds_check";
ALTER TABLE "ProductImageEnhancementJob" ADD CONSTRAINT "Enhancement_bounds_check" CHECK (
 "generation" BETWEEN 0 AND 2 AND "attempts" BETWEEN 0 AND 3
 AND "mode" IN ('CLEAN','BACKGROUND_REMOVE','STUDIO_COMPOSITE','AI_ENHANCE','NEURAL_BACKGROUND_REMOVE','GEMINI_BRAND_STUDIO','PREMIUM_3D_STUDIO')
 AND "status" IN ('PENDING','PROCESSING','COMPLETED','FAILED','UNKNOWN','CANCELLED')
);
