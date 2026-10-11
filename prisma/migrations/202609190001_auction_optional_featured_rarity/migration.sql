-- Rename the old auction rarity in place so existing NORMAL auctions become FEATURED.
-- ProductRarity and AuctionTier are intentionally unchanged.
ALTER TYPE "AuctionRarity" RENAME VALUE 'NORMAL' TO 'FEATURED';

-- Newly created auctions may have no rarity classification.
ALTER TABLE "Auction" ALTER COLUMN "rarity" DROP DEFAULT;
ALTER TABLE "Auction" ALTER COLUMN "rarity" DROP NOT NULL;
