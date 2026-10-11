ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'COD_DEPOSIT';

CREATE TYPE "CheckoutPaymentMethod" AS ENUM ('WALLET', 'CASH_ON_DELIVERY');
CREATE TYPE "CheckoutStatus" AS ENUM ('AWAITING_SELECTION', 'AWAITING_FULFILLMENT');

ALTER TABLE "Bid" ADD COLUMN "reservedAmount" DECIMAL(12,2);

ALTER TABLE "OrderItem"
  ADD COLUMN "checkoutStatus" "CheckoutStatus",
  ADD COLUMN "paymentMethod" "CheckoutPaymentMethod",
  ADD COLUMN "walletPaidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cashDueAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryAddressSnapshot" JSONB,
  ADD COLUMN "deliveryPhone" TEXT,
  ADD COLUMN "checkoutConfirmedAt" TIMESTAMP(3);

ALTER TABLE "ShipmentRequest"
  ADD COLUMN "paymentMethod" "CheckoutPaymentMethod",
  ADD COLUMN "walletPaidAmount" DECIMAL(12,2),
  ADD COLUMN "cashDueAmount" DECIMAL(12,2);

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_checkout_amounts_nonnegative"
  CHECK ("walletPaidAmount" >= 0 AND "cashDueAmount" >= 0);

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_checkout_amounts_match_price"
  CHECK ("checkoutConfirmedAt" IS NULL OR "walletPaidAmount" + "cashDueAmount" = "price");

ALTER TABLE "ShipmentRequest"
  ADD CONSTRAINT "ShipmentRequest_checkout_amounts_match_total"
  CHECK (
    "paymentMethod" IS NULL OR
    ("walletPaidAmount" IS NOT NULL AND "cashDueAmount" IS NOT NULL AND
     "walletPaidAmount" >= 0 AND "cashDueAmount" >= 0 AND
     "walletPaidAmount" + "cashDueAmount" = "totalAmount")
  );
