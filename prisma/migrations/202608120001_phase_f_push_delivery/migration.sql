-- Phase F adds customer-scoped push registrations and durable per-device delivery state.
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS');
CREATE TYPE "PushDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

CREATE TABLE "CustomerDevice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "pushToken" TEXT NOT NULL,
    "preferredLocale" TEXT NOT NULL DEFAULT 'ar',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPushDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "customerDeviceId" TEXT NOT NULL,
    "status" "PushDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationPushDelivery_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NotificationCampaign"
  ADD COLUMN "pushQueuedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pushSuccessCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pushFailureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "noDeviceCount" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "CustomerDevice_installationId_key" ON "CustomerDevice"("installationId");
CREATE UNIQUE INDEX "CustomerDevice_pushToken_key" ON "CustomerDevice"("pushToken");
CREATE INDEX "CustomerDevice_customerId_enabled_idx" ON "CustomerDevice"("customerId", "enabled");
CREATE INDEX "CustomerDevice_pushToken_idx" ON "CustomerDevice"("pushToken");
CREATE UNIQUE INDEX "NotificationPushDelivery_notificationId_customerDeviceId_key" ON "NotificationPushDelivery"("notificationId", "customerDeviceId");
CREATE INDEX "NotificationPushDelivery_status_createdAt_idx" ON "NotificationPushDelivery"("status", "createdAt");
CREATE INDEX "NotificationPushDelivery_customerDeviceId_status_idx" ON "NotificationPushDelivery"("customerDeviceId", "status");

ALTER TABLE "CustomerDevice" ADD CONSTRAINT "CustomerDevice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPushDelivery" ADD CONSTRAINT "NotificationPushDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPushDelivery" ADD CONSTRAINT "NotificationPushDelivery_customerDeviceId_fkey" FOREIGN KEY ("customerDeviceId") REFERENCES "CustomerDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
