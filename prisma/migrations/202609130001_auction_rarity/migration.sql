-- Auction classifications are separate from legacy product rarity data.
CREATE TYPE "AuctionRarity" AS ENUM ('NORMAL', 'RARE', 'LEGENDARY');

ALTER TABLE "Auction"
ADD COLUMN "rarity" "AuctionRarity" NOT NULL DEFAULT 'NORMAL';

CREATE INDEX "Auction_rarity_status_idx" ON "Auction"("rarity", "status");
