ALTER TABLE "ScreenDevice"
ADD COLUMN "installationId" TEXT,
ADD COLUMN "pairedAt" TIMESTAMP(3),
ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ScreenDevice_installationId_key" ON "ScreenDevice"("installationId");
CREATE INDEX "ScreenDevice_lastSeenAt_idx" ON "ScreenDevice"("lastSeenAt");

CREATE TABLE "ScreenPairingChallenge" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "credentialIssuedAt" TIMESTAMP(3),
    "screenDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScreenPairingChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScreenPairingChallenge_installationId_createdAt_idx"
ON "ScreenPairingChallenge"("installationId", "createdAt");
CREATE INDEX "ScreenPairingChallenge_expiresAt_idx"
ON "ScreenPairingChallenge"("expiresAt");

CREATE TABLE "QuickSaleDisplayRecord" (
    "id" TEXT NOT NULL,
    "customerDisplayName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IQD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuickSaleDisplayRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuickSaleDisplayRecord_createdAt_idx" ON "QuickSaleDisplayRecord"("createdAt");
