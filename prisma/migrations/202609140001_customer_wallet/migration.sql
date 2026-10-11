CREATE TYPE "WalletEntryType" AS ENUM ('PURCHASE', 'BID_HOLD', 'BID_RELEASE', 'BID_SETTLEMENT');

CREATE TABLE "CustomerWallet" (
  "customerId" TEXT NOT NULL,
  "availableBalance" DECIMAL(16,2) NOT NULL DEFAULT 0,
  "reservedBalance" DECIMAL(16,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'IQD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerWallet_pkey" PRIMARY KEY ("customerId"),
  CONSTRAINT "CustomerWallet_nonnegative" CHECK ("availableBalance" >= 0 AND "reservedBalance" >= 0),
  CONSTRAINT "CustomerWallet_currency" CHECK ("currency" = 'IQD')
);

CREATE TABLE "WalletEntry" (
  "id" TEXT NOT NULL,
  "walletCustomerId" TEXT NOT NULL,
  "type" "WalletEntryType" NOT NULL,
  "amount" DECIMAL(16,2) NOT NULL,
  "availableAfter" DECIMAL(16,2) NOT NULL,
  "reservedAfter" DECIMAL(16,2) NOT NULL,
  "referenceId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletEntry_positive" CHECK ("amount" > 0)
);

ALTER TABLE "Bid" ADD COLUMN "walletReserved" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "WalletEntry_eventKey_key" ON "WalletEntry"("eventKey");
CREATE INDEX "WalletEntry_walletCustomerId_createdAt_idx" ON "WalletEntry"("walletCustomerId", "createdAt");
ALTER TABLE "CustomerWallet" ADD CONSTRAINT "CustomerWallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_walletCustomerId_fkey" FOREIGN KEY ("walletCustomerId") REFERENCES "CustomerWallet"("customerId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_wallet_entry_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Wallet entries are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WalletEntry_append_only"
BEFORE UPDATE OR DELETE ON "WalletEntry"
FOR EACH ROW EXECUTE FUNCTION "prevent_wallet_entry_mutation"();
