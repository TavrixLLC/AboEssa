CREATE TYPE "ProductRarity" AS ENUM ('NORMAL', 'RARE', 'LEGENDARY');

ALTER TABLE "ProductListing"
  ADD COLUMN "rarity" "ProductRarity" NOT NULL DEFAULT 'NORMAL';

CREATE INDEX "ProductListing_rarity_status_idx" ON "ProductListing"("rarity", "status");
