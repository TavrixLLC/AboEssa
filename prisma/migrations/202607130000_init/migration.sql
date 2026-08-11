-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN', 'SALES_OPERATOR', 'WAREHOUSE', 'ACCOUNTANT', 'VIEWER');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('ADMIN', 'CUSTOMER', 'SCREEN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('VIRTUAL', 'ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SaleSource" AS ENUM ('TIKTOK_LIVE_MANUAL', 'APP_LIVE', 'APP_FIXED_PRICE', 'APP_AUCTION', 'ADMIN_MANUAL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'SHIPPING_REQUESTED', 'PACKING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('SOLD', 'IN_CUSTOMER_BOX', 'SHIPPING_REQUESTED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LabelStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PRINTED', 'ATTACHED');

-- CreateEnum
CREATE TYPE "ProductListingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SOLD', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('ACTIVE', 'OUTBID', 'WINNING', 'WON', 'LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LiveSessionStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "LiveSessionSource" AS ENUM ('APP_LIVE', 'TIKTOK_EXTERNAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "LiveOfferType" AS ENUM ('FIXED_PRICE', 'AUCTION');

-- CreateEnum
CREATE TYPE "LiveOfferStatus" AS ENUM ('ACTIVE', 'SOLD', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'PRINTED', 'FAILED', 'CONFIRMED_ATTACHED');

-- CreateEnum
CREATE TYPE "ShippingRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PACKING', 'SHIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('CREATED', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScreenStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BID_OUTBID', 'AUCTION_ENDING_SOON', 'AUCTION_WON', 'AUCTION_LOST', 'ORDER_UPDATED', 'VERIFICATION_UPDATED', 'AD', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AdPlacement" AS ENUM ('HOME_BANNER', 'AUCTIONS_PAGE', 'BEFORE_LIVE', 'LIVE_BOTTOM', 'IN_APP_CARD');

-- CreateEnum
CREATE TYPE "AdTargetType" AS ENUM ('ALL', 'VERIFIED', 'VIP', 'CATEGORY_INTEREST');

-- CreateEnum
CREATE TYPE "AdLinkType" AS ENUM ('NONE', 'CATEGORY', 'PRODUCT', 'AUCTION', 'LIVE');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'VIEWER',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "refreshTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "whatsappPhone" TEXT,
    "tiktokUsername" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "isVirtual" BOOLEAN NOT NULL DEFAULT false,
    "purchaseLimitOverride" DECIMAL(12,2),
    "totalPurchasedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCancelledAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "trustLevel" TEXT,
    "notes" TEXT,
    "referralCodeUsed" TEXT,
    "referredByInfluencerId" TEXT,
    "referralExpiresAt" TIMESTAMP(3),
    "refreshTokenHash" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "governorate" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "nearestPoint" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "storePhone" TEXT,
    "storeAddress" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'IQD',
    "allowUnverifiedPurchase" BOOLEAN NOT NULL DEFAULT true,
    "unverifiedPurchaseLimit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "allowUnverifiedBidding" BOOLEAN NOT NULL DEFAULT true,
    "unverifiedBidLimit" DECIMAL(12,2),
    "defaultAuctionExtensionSeconds" INTEGER NOT NULL DEFAULT 180,
    "defaultAuctionExtensionTriggerSeconds" INTEGER NOT NULL DEFAULT 60,
    "defaultLiveAuctionResetSeconds" INTEGER NOT NULL DEFAULT 10,
    "defaultLongAuctionExtensionSeconds" INTEGER NOT NULL DEFAULT 180,
    "auctionEndingSoonNotifyMinutes" INTEGER NOT NULL DEFAULT 5,
    "maxAuctionExtensions" INTEGER NOT NULL DEFAULT 20,
    "labelTemplate" JSONB NOT NULL,
    "shippingRequestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerBox" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lastItemAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "shippingRequestedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "productListingId" TEXT,
    "auctionId" TEXT,
    "liveSessionId" TEXT,
    "liveOfferId" TEXT,
    "source" "SaleSource" NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "snapshotUrl" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "barcode" TEXT NOT NULL,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'IN_CUSTOMER_BOX',
    "labelStatus" "LabelStatus" NOT NULL DEFAULT 'PENDING',
    "isBroken" BOOLEAN NOT NULL DEFAULT false,
    "isGift" BOOLEAN NOT NULL DEFAULT false,
    "isReplacement" BOOLEAN NOT NULL DEFAULT false,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "labelPrintedAt" TIMESTAMP(3),
    "labelAttachedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductListing" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price" DECIMAL(12,2) NOT NULL,
    "status" "ProductListingStatus" NOT NULL DEFAULT 'DRAFT',
    "soldToCustomerId" TEXT,
    "soldOrderItemId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startingPrice" DECIMAL(12,2) NOT NULL,
    "currentPrice" DECIMAL(12,2) NOT NULL,
    "minIncrement" DECIMAL(12,2) NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "originalEndsAt" TIMESTAMP(3) NOT NULL,
    "extensionSeconds" INTEGER NOT NULL,
    "extensionTriggerSeconds" INTEGER NOT NULL,
    "maxExtensions" INTEGER NOT NULL,
    "extensionsCount" INTEGER NOT NULL DEFAULT 0,
    "winnerCustomerId" TEXT,
    "winningBidId" TEXT,
    "soldOrderItemId" TEXT,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "BidStatus" NOT NULL DEFAULT 'ACTIVE',
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "source" "LiveSessionSource" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "numberOfSales" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveOffer" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT,
    "categoryId" TEXT,
    "type" "LiveOfferType" NOT NULL,
    "price" DECIMAL(12,2),
    "startingPrice" DECIMAL(12,2),
    "minIncrement" DECIMAL(12,2),
    "durationSeconds" INTEGER,
    "status" "LiveOfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "imageUrl" TEXT,
    "currentAuctionId" TEXT,
    "soldOrderItemId" TEXT,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelPrintJob" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "template" JSONB NOT NULL,
    "printerName" TEXT,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "printedByAdminId" TEXT,
    "printedAt" TIMESTAMP(3),
    "confirmedByAdminId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelPrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "addressId" TEXT,
    "status" "ShippingRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "customerNote" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "itemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shippingCompany" TEXT,
    "trackingNumber" TEXT,
    "shippingPrice" DECIMAL(12,2),
    "status" "ShipmentStatus" NOT NULL DEFAULT 'CREATED',
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreenDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "status" "ScreenStatus" NOT NULL DEFAULT 'ACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreenDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Influencer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Influencer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "commissionRate" DECIMAL(5,2) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralAttribution" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "referralCodeId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionLedger" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "customerId" TEXT,
    "orderItemId" TEXT,
    "amountBase" DECIMAL(12,2) NOT NULL,
    "commissionRate" DECIMAL(5,2) NOT NULL,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "CommissionLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InAppAd" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "placement" "AdPlacement" NOT NULL,
    "targetType" "AdTargetType" NOT NULL DEFAULT 'ALL',
    "targetCategoryId" TEXT,
    "linkType" "AdLinkType" NOT NULL DEFAULT 'NONE',
    "linkTargetId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InAppAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNotificationSettings" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "auctionOutbid" BOOLEAN NOT NULL DEFAULT true,
    "auctionEndingSoon" BOOLEAN NOT NULL DEFAULT true,
    "auctionWon" BOOLEAN NOT NULL DEFAULT true,
    "orderUpdates" BOOLEAN NOT NULL DEFAULT true,
    "ads" BOOLEAN NOT NULL DEFAULT true,
    "system" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerNotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "pushSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedByAdminId" TEXT,
    "uploadedByCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_role_idx" ON "AdminUser"("role");

-- CreateIndex
CREATE INDEX "AdminUser_isActive_idx" ON "AdminUser"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_verificationStatus_idx" ON "Customer"("verificationStatus");

-- CreateIndex
CREATE INDEX "Customer_isVirtual_idx" ON "Customer"("isVirtual");

-- CreateIndex
CREATE INDEX "Customer_tiktokUsername_idx" ON "Customer"("tiktokUsername");

-- CreateIndex
CREATE INDEX "Customer_referredByInfluencerId_idx" ON "Customer"("referredByInfluencerId");

-- CreateIndex
CREATE INDEX "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");

-- CreateIndex
CREATE INDEX "VerificationRequest_customerId_idx" ON "VerificationRequest"("customerId");

-- CreateIndex
CREATE INDEX "VerificationRequest_status_idx" ON "VerificationRequest"("status");

-- CreateIndex
CREATE INDEX "VerificationRequest_requestedAt_idx" ON "VerificationRequest"("requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_isActive_sortOrder_idx" ON "Category"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerBox_customerId_key" ON "CustomerBox"("customerId");

-- CreateIndex
CREATE INDEX "Order_customerId_status_idx" ON "Order"("customerId", "status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_barcode_key" ON "OrderItem"("barcode");

-- CreateIndex
CREATE INDEX "OrderItem_customerId_status_idx" ON "OrderItem"("customerId", "status");

-- CreateIndex
CREATE INDEX "OrderItem_labelStatus_idx" ON "OrderItem"("labelStatus");

-- CreateIndex
CREATE INDEX "OrderItem_source_soldAt_idx" ON "OrderItem"("source", "soldAt");

-- CreateIndex
CREATE INDEX "OrderItem_categoryId_idx" ON "OrderItem"("categoryId");

-- CreateIndex
CREATE INDEX "OrderItem_createdByAdminId_idx" ON "OrderItem"("createdByAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductListing_soldOrderItemId_key" ON "ProductListing"("soldOrderItemId");

-- CreateIndex
CREATE INDEX "ProductListing_status_publishedAt_idx" ON "ProductListing"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "ProductListing_categoryId_idx" ON "ProductListing"("categoryId");

-- CreateIndex
CREATE INDEX "ProductListing_createdByAdminId_idx" ON "ProductListing"("createdByAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "Auction_winningBidId_key" ON "Auction"("winningBidId");

-- CreateIndex
CREATE UNIQUE INDEX "Auction_soldOrderItemId_key" ON "Auction"("soldOrderItemId");

-- CreateIndex
CREATE INDEX "Auction_status_startsAt_endsAt_idx" ON "Auction"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Auction_categoryId_idx" ON "Auction"("categoryId");

-- CreateIndex
CREATE INDEX "Auction_createdByAdminId_idx" ON "Auction"("createdByAdminId");

-- CreateIndex
CREATE INDEX "Bid_auctionId_status_idx" ON "Bid"("auctionId", "status");

-- CreateIndex
CREATE INDEX "Bid_customerId_createdAt_idx" ON "Bid"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveSession_status_startedAt_idx" ON "LiveSession"("status", "startedAt");

-- CreateIndex
CREATE INDEX "LiveSession_createdByAdminId_idx" ON "LiveSession"("createdByAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveOffer_currentAuctionId_key" ON "LiveOffer"("currentAuctionId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveOffer_soldOrderItemId_key" ON "LiveOffer"("soldOrderItemId");

-- CreateIndex
CREATE INDEX "LiveOffer_liveSessionId_status_idx" ON "LiveOffer"("liveSessionId", "status");

-- CreateIndex
CREATE INDEX "LiveOffer_createdByAdminId_idx" ON "LiveOffer"("createdByAdminId");

-- CreateIndex
CREATE INDEX "LabelPrintJob_orderItemId_idx" ON "LabelPrintJob"("orderItemId");

-- CreateIndex
CREATE INDEX "LabelPrintJob_customerId_idx" ON "LabelPrintJob"("customerId");

-- CreateIndex
CREATE INDEX "LabelPrintJob_status_idx" ON "LabelPrintJob"("status");

-- CreateIndex
CREATE INDEX "LabelPrintJob_barcode_idx" ON "LabelPrintJob"("barcode");

-- CreateIndex
CREATE INDEX "ShipmentRequest_customerId_status_idx" ON "ShipmentRequest"("customerId", "status");

-- CreateIndex
CREATE INDEX "ShipmentRequest_addressId_idx" ON "ShipmentRequest"("addressId");

-- CreateIndex
CREATE INDEX "ShipmentRequest_createdAt_idx" ON "ShipmentRequest"("createdAt");

-- CreateIndex
CREATE INDEX "Shipment_customerId_status_idx" ON "Shipment"("customerId", "status");

-- CreateIndex
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

-- CreateIndex
CREATE INDEX "ScreenDevice_status_isActive_idx" ON "ScreenDevice"("status", "isActive");

-- CreateIndex
CREATE INDEX "Influencer_isActive_idx" ON "Influencer"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE INDEX "ReferralCode_influencerId_isActive_idx" ON "ReferralCode"("influencerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralAttribution_customerId_key" ON "ReferralAttribution"("customerId");

-- CreateIndex
CREATE INDEX "ReferralAttribution_influencerId_status_idx" ON "ReferralAttribution"("influencerId", "status");

-- CreateIndex
CREATE INDEX "ReferralAttribution_expiresAt_idx" ON "ReferralAttribution"("expiresAt");

-- CreateIndex
CREATE INDEX "CommissionLedger_influencerId_status_idx" ON "CommissionLedger"("influencerId", "status");

-- CreateIndex
CREATE INDEX "CommissionLedger_customerId_idx" ON "CommissionLedger"("customerId");

-- CreateIndex
CREATE INDEX "CommissionLedger_orderItemId_idx" ON "CommissionLedger"("orderItemId");

-- CreateIndex
CREATE INDEX "InAppAd_placement_isActive_startsAt_endsAt_idx" ON "InAppAd"("placement", "isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "InAppAd_targetCategoryId_idx" ON "InAppAd"("targetCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerNotificationSettings_customerId_key" ON "CustomerNotificationSettings"("customerId");

-- CreateIndex
CREATE INDEX "Notification_customerId_readAt_idx" ON "Notification"("customerId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorType_actorId_idx" ON "AuditLog"("actorType", "actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_key_key" ON "FileAsset"("key");

-- CreateIndex
CREATE INDEX "FileAsset_uploadedByAdminId_idx" ON "FileAsset"("uploadedByAdminId");

-- CreateIndex
CREATE INDEX "FileAsset_uploadedByCustomerId_idx" ON "FileAsset"("uploadedByCustomerId");

-- CreateIndex
CREATE INDEX "FileAsset_mimeType_idx" ON "FileAsset"("mimeType");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_actorType_actorId_endpoint_key" ON "IdempotencyKey"("key", "actorType", "actorId", "endpoint");

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBox" ADD CONSTRAINT "CustomerBox_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productListingId_fkey" FOREIGN KEY ("productListingId") REFERENCES "ProductListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_liveOfferId_fkey" FOREIGN KEY ("liveOfferId") REFERENCES "LiveOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductListing" ADD CONSTRAINT "ProductListing_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductListing" ADD CONSTRAINT "ProductListing_soldToCustomerId_fkey" FOREIGN KEY ("soldToCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductListing" ADD CONSTRAINT "ProductListing_soldOrderItemId_fkey" FOREIGN KEY ("soldOrderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductListing" ADD CONSTRAINT "ProductListing_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_winnerCustomerId_fkey" FOREIGN KEY ("winnerCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_winningBidId_fkey" FOREIGN KEY ("winningBidId") REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_soldOrderItemId_fkey" FOREIGN KEY ("soldOrderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOffer" ADD CONSTRAINT "LiveOffer_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOffer" ADD CONSTRAINT "LiveOffer_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOffer" ADD CONSTRAINT "LiveOffer_currentAuctionId_fkey" FOREIGN KEY ("currentAuctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOffer" ADD CONSTRAINT "LiveOffer_soldOrderItemId_fkey" FOREIGN KEY ("soldOrderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOffer" ADD CONSTRAINT "LiveOffer_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelPrintJob" ADD CONSTRAINT "LabelPrintJob_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelPrintJob" ADD CONSTRAINT "LabelPrintJob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelPrintJob" ADD CONSTRAINT "LabelPrintJob_printedByAdminId_fkey" FOREIGN KEY ("printedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelPrintJob" ADD CONSTRAINT "LabelPrintJob_confirmedByAdminId_fkey" FOREIGN KEY ("confirmedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentRequest" ADD CONSTRAINT "ShipmentRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentRequest" ADD CONSTRAINT "ShipmentRequest_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "CustomerAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLedger" ADD CONSTRAINT "CommissionLedger_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLedger" ADD CONSTRAINT "CommissionLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLedger" ADD CONSTRAINT "CommissionLedger_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppAd" ADD CONSTRAINT "InAppAd_targetCategoryId_fkey" FOREIGN KEY ("targetCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppAd" ADD CONSTRAINT "InAppAd_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNotificationSettings" ADD CONSTRAINT "CustomerNotificationSettings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploadedByAdminId_fkey" FOREIGN KEY ("uploadedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploadedByCustomerId_fkey" FOREIGN KEY ("uploadedByCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

