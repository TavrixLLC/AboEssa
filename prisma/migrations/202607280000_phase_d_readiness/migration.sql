-- Additive Phase D contract fields. Existing records retain their current behavior.
CREATE TYPE "AuctionTier" AS ENUM ('NORMAL', 'VIP');
ALTER TABLE "Auction" ADD COLUMN "tier" "AuctionTier" NOT NULL DEFAULT 'NORMAL';

ALTER TABLE "LiveSession"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "coverImageUrl" TEXT,
  ADD COLUMN "playbackUrl" TEXT,
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "viewerCount" INTEGER NOT NULL DEFAULT 0;

ALTER TYPE "AdPlacement" ADD VALUE IF NOT EXISTS 'STORE_HERO';
ALTER TYPE "AdPlacement" ADD VALUE IF NOT EXISTS 'STORE_INLINE';
ALTER TYPE "AdPlacement" ADD VALUE IF NOT EXISTS 'LIVE_BANNER';
ALTER TYPE "AdPlacement" ADD VALUE IF NOT EXISTS 'SETTINGS_PROMO';
ALTER TYPE "AdLinkType" ADD VALUE IF NOT EXISTS 'EXTERNAL_URL';
ALTER TABLE "InAppAd"
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CustomerAddress" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "ShipmentRequest"
  ADD COLUMN "addressSnapshot" JSONB,
  ADD COLUMN "shippingCompany" TEXT,
  ADD COLUMN "trackingNumber" TEXT,
  ADD COLUMN "shippingPrice" DECIMAL(12,2),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "packedAt" TIMESTAMP(3),
  ADD COLUMN "shippedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

ALTER TABLE "CommissionLedger" ADD COLUMN "cancelledAt" TIMESTAMP(3);

CREATE INDEX "InAppAd_placement_priority_sortOrder_idx" ON "InAppAd"("placement", "priority", "sortOrder");
