ALTER TABLE "ProductListing"
  ADD COLUMN "discountPercentage" INTEGER;

ALTER TABLE "ProductListing"
  ADD CONSTRAINT "ProductListing_discountPercentage_check"
  CHECK ("discountPercentage" IS NULL OR "discountPercentage" BETWEEN 1 AND 99);

CREATE INDEX "ProductListing_discountPercentage_status_idx"
  ON "ProductListing"("discountPercentage", "status");
