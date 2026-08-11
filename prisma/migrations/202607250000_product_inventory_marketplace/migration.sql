-- Product inventory for fixed-price listings.
-- Existing listings are treated as one-unit products:
-- draft/active/cancelled/expired listings keep one available unit,
-- legacy sold listings keep one sold unit and zero available units.

ALTER TABLE "ProductListing"
  ADD COLUMN "totalQuantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "availableQuantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "soldQuantity" INTEGER NOT NULL DEFAULT 0;

UPDATE "ProductListing"
SET
  "totalQuantity" = 1,
  "availableQuantity" = CASE
    WHEN "status" = 'SOLD' OR "soldOrderItemId" IS NOT NULL OR "soldToCustomerId" IS NOT NULL THEN 0
    ELSE 1
  END,
  "soldQuantity" = CASE
    WHEN "status" = 'SOLD' OR "soldOrderItemId" IS NOT NULL OR "soldToCustomerId" IS NOT NULL THEN 1
    ELSE 0
  END;

ALTER TABLE "ProductListing"
  ADD CONSTRAINT "ProductListing_totalQuantity_check" CHECK ("totalQuantity" >= 1),
  ADD CONSTRAINT "ProductListing_availableQuantity_check" CHECK ("availableQuantity" >= 0),
  ADD CONSTRAINT "ProductListing_soldQuantity_check" CHECK ("soldQuantity" >= 0),
  ADD CONSTRAINT "ProductListing_quantity_balance_check" CHECK ("totalQuantity" = "availableQuantity" + "soldQuantity");

CREATE INDEX "ProductListing_status_availableQuantity_idx"
  ON "ProductListing"("status", "availableQuantity");
