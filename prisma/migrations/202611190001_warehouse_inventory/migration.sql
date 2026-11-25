-- Additive Phase 4 foundation. No automatic stock backfill or legacy rewrites.
ALTER TABLE "ProductListing" ADD COLUMN "inventoryMappedAt" TIMESTAMP(3);
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING_BALANCE','STOCK_IN','RESERVATION','SALE','SALE_REVERSAL','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT');
CREATE TYPE "InventoryAllocationStatus" AS ENUM ('RESERVED','SHIPPED','REVERSED');
CREATE TABLE "Warehouse" (
 "id" TEXT PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
 "description" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "isSystem" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Warehouse_code_normalized" CHECK ("code"=upper(btrim("code")) AND "code" ~ '^[A-Z0-9_][A-Z0-9_-]{0,39}$')
);
CREATE TABLE "WarehouseLocation" (
 "id" TEXT PRIMARY KEY,"warehouseId" TEXT NOT NULL REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "parentId" TEXT REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "code" TEXT NOT NULL,"name" TEXT NOT NULL,"description" TEXT,"type" TEXT NOT NULL DEFAULT 'STANDARD',
 "sortOrder" INTEGER NOT NULL DEFAULT 0,"isActive" BOOLEAN NOT NULL DEFAULT true,"isSystem" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "WarehouseLocation_code_normalized" CHECK ("code"=upper(btrim("code")) AND "code" ~ '^[A-Z0-9_][A-Z0-9_-]{0,39}$'),
 CONSTRAINT "WarehouseLocation_parent_not_self" CHECK ("parentId" IS DISTINCT FROM "id")
);
CREATE UNIQUE INDEX "WarehouseLocation_warehouseId_code_key" ON "WarehouseLocation"("warehouseId","code");
CREATE INDEX "WarehouseLocation_warehouseId_isActive_sortOrder_id_idx" ON "WarehouseLocation"("warehouseId","isActive","sortOrder","id");
CREATE INDEX "WarehouseLocation_parentId_idx" ON "WarehouseLocation"("parentId");
CREATE TABLE "InventoryBalance" (
 "id" TEXT PRIMARY KEY,"productId" TEXT NOT NULL REFERENCES "ProductListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "locationId" TEXT NOT NULL REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "quantityOnHand" INTEGER NOT NULL DEFAULT 0,"quantityReserved" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "InventoryBalance_nonnegative" CHECK ("quantityOnHand">=0 AND "quantityReserved">=0 AND "quantityReserved"<="quantityOnHand")
);
CREATE UNIQUE INDEX "InventoryBalance_productId_locationId_key" ON "InventoryBalance"("productId","locationId");
CREATE INDEX "InventoryBalance_locationId_productId_idx" ON "InventoryBalance"("locationId","productId");
CREATE TABLE "InventoryOperation" (
 "id" TEXT PRIMARY KEY,"scope" TEXT NOT NULL,"key" TEXT NOT NULL,"kind" TEXT NOT NULL,"requestHash" TEXT NOT NULL,
 "actorType" "ActorType" NOT NULL,"actorId" TEXT,"reason" TEXT,"reference" TEXT,"notes" TEXT,
 "outcome" JSONB NOT NULL DEFAULT '{}',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InventoryOperation_scope_key_key" ON "InventoryOperation"("scope","key");
CREATE INDEX "InventoryOperation_createdAt_id_idx" ON "InventoryOperation"("createdAt","id");
CREATE TABLE "InventoryMovement" (
 "id" TEXT PRIMARY KEY,"productId" TEXT NOT NULL REFERENCES "ProductListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "locationId" TEXT NOT NULL REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "operationId" TEXT NOT NULL REFERENCES "InventoryOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "movementType" "InventoryMovementType" NOT NULL,"quantityDelta" INTEGER NOT NULL,"quantityBefore" INTEGER NOT NULL,"quantityAfter" INTEGER NOT NULL,
 "reservedDelta" INTEGER NOT NULL DEFAULT 0,"reservedBefore" INTEGER NOT NULL DEFAULT 0,"reservedAfter" INTEGER NOT NULL DEFAULT 0,
 "warehouseCode" TEXT NOT NULL,"locationCode" TEXT NOT NULL,"referenceType" TEXT,"referenceId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "InventoryMovement_arithmetic" CHECK (
  "quantityBefore">=0 AND "quantityAfter">=0 AND "reservedBefore">=0 AND "reservedAfter">=0 AND
  "quantityAfter"="quantityBefore"+"quantityDelta" AND "reservedAfter"="reservedBefore"+"reservedDelta" AND
  "reservedBefore"<="quantityBefore" AND "reservedAfter"<="quantityAfter")
);
CREATE INDEX "InventoryMovement_productId_createdAt_id_idx" ON "InventoryMovement"("productId","createdAt","id");
CREATE INDEX "InventoryMovement_locationId_createdAt_id_idx" ON "InventoryMovement"("locationId","createdAt","id");
CREATE INDEX "InventoryMovement_operationId_idx" ON "InventoryMovement"("operationId");
CREATE INDEX "InventoryMovement_referenceType_referenceId_idx" ON "InventoryMovement"("referenceType","referenceId");
CREATE TABLE "InventoryAllocation" (
 "id" TEXT PRIMARY KEY,"productId" TEXT NOT NULL REFERENCES "ProductListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "orderItemId" TEXT NOT NULL REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "locationId" TEXT NOT NULL REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "quantity" INTEGER NOT NULL CHECK ("quantity">0),"status" "InventoryAllocationStatus" NOT NULL DEFAULT 'RESERVED',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "InventoryAllocation_orderItemId_locationId_key" ON "InventoryAllocation"("orderItemId","locationId");
CREATE INDEX "InventoryAllocation_productId_status_locationId_idx" ON "InventoryAllocation"("productId","status","locationId");
CREATE INDEX "InventoryAllocation_locationId_status_idx" ON "InventoryAllocation"("locationId","status");

CREATE FUNCTION inventory_movement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Inventory movements are append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER "InventoryMovement_append_only" BEFORE UPDATE OR DELETE ON "InventoryMovement"
FOR EACH ROW EXECUTE FUNCTION inventory_movement_immutable();

-- Fail closed at COMMIT if any coordinated mapped product write drifts.
-- Deferred because the legacy aggregate, balance and allocation change together.
CREATE FUNCTION inventory_check_product() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid text; p record; b record; allocated bigint;
BEGIN
 IF TG_TABLE_NAME='ProductListing' THEN pid:=COALESCE(NEW.id,OLD.id);
 ELSE pid:=COALESCE(NEW."productId",OLD."productId"); END IF;
 SELECT * INTO p FROM "ProductListing" WHERE id=pid;
 IF NOT FOUND OR p."inventoryMappedAt" IS NULL THEN RETURN NULL; END IF;
 SELECT COALESCE(sum("quantityOnHand"),0) oh,COALESCE(sum("quantityReserved"),0) rs INTO b FROM "InventoryBalance" WHERE "productId"=pid;
 SELECT COALESCE(sum(quantity),0) INTO allocated FROM "InventoryAllocation" WHERE "productId"=pid AND status='RESERVED';
 IF p."availableQuantity"<0 OR p."soldQuantity"<0 OR p."totalQuantity"<>p."availableQuantity"+p."soldQuantity"
 OR b.oh-b.rs<>p."availableQuantity" OR b.rs<>allocated THEN
  RAISE EXCEPTION 'Mapped inventory mismatch for product %',pid USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "ProductListing_inventory_consistent" AFTER INSERT OR UPDATE ON "ProductListing"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_check_product();
CREATE CONSTRAINT TRIGGER "InventoryBalance_consistent" AFTER INSERT OR UPDATE OR DELETE ON "InventoryBalance"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_check_product();
CREATE CONSTRAINT TRIGGER "InventoryAllocation_consistent" AFTER INSERT OR UPDATE OR DELETE ON "InventoryAllocation"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_check_product();
