-- Phase D.6: persisted admin-created notification campaigns.
-- Legacy LiveSession and Live enum values intentionally remain for historical
-- data and the separate manual sales-session workflow.
CREATE TYPE "NotificationAudienceType" AS ENUM (
  'ALL_ACTIVE_CUSTOMERS',
  'ONE_CUSTOMER',
  'SELECTED_CUSTOMERS',
  'VERIFIED_CUSTOMERS',
  'UNVERIFIED_CUSTOMERS'
);

CREATE TYPE "NotificationLinkType" AS ENUM ('NONE', 'PRODUCT', 'AUCTION', 'CATEGORY');
CREATE TYPE "NotificationCampaignStatus" AS ENUM ('SENT', 'PARTIAL', 'FAILED');

CREATE TABLE "NotificationCampaign" (
  "id" TEXT NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "titleAr" TEXT NOT NULL,
  "titleEn" TEXT,
  "bodyAr" TEXT NOT NULL,
  "bodyEn" TEXT,
  "audienceType" "NotificationAudienceType" NOT NULL,
  "audienceMetadata" JSONB,
  "linkType" "NotificationLinkType" NOT NULL DEFAULT 'NONE',
  "linkTargetId" TEXT,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "status" "NotificationCampaignStatus" NOT NULL DEFAULT 'SENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationCampaign_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification"
ADD COLUMN "campaignId" TEXT;

CREATE UNIQUE INDEX "NotificationCampaign_createdByAdminId_idempotencyKey_key"
ON "NotificationCampaign"("createdByAdminId", "idempotencyKey");
CREATE INDEX "NotificationCampaign_createdAt_idx" ON "NotificationCampaign"("createdAt");
CREATE INDEX "NotificationCampaign_audienceType_status_createdAt_idx"
ON "NotificationCampaign"("audienceType", "status", "createdAt");
CREATE INDEX "Notification_campaignId_idx" ON "Notification"("campaignId");

ALTER TABLE "NotificationCampaign"
ADD CONSTRAINT "NotificationCampaign_createdByAdminId_fkey"
FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "NotificationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
