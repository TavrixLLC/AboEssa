-- Inventory-specific relaxation: a counted-out product may have zero total.
-- No historical rows are changed. The total=available+sold invariant remains.
ALTER TABLE "ProductListing" ADD CONSTRAINT "ProductListing_total_nonnegative_check" CHECK ("totalQuantity">=0);
ALTER TABLE "ProductListing" DROP CONSTRAINT "ProductListing_totalQuantity_check";

CREATE OR REPLACE FUNCTION inventory_check_product() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid text; p record; b record; allocated bigint;
BEGIN
 IF TG_TABLE_NAME='ProductListing' THEN pid:=COALESCE(NEW.id,OLD.id);
 ELSE pid:=COALESCE(NEW."productId",OLD."productId"); END IF;
 SELECT * INTO p FROM "ProductListing" WHERE id=pid;
 IF NOT FOUND OR p."inventoryMappedAt" IS NULL THEN RETURN NULL; END IF;
 SELECT COALESCE(sum("quantityOnHand"),0) oh,COALESCE(sum("quantityReserved"),0) rs INTO b FROM "InventoryBalance" WHERE "productId"=pid;
 SELECT COALESCE(sum(quantity),0) INTO allocated FROM "InventoryAllocation" WHERE "productId"=pid AND status='RESERVED';
 IF p."availableQuantity"<0 OR p."soldQuantity"<0 OR p."totalQuantity"<>p."availableQuantity"+p."soldQuantity"
 OR b.oh-b.rs<>p."availableQuantity" OR b.rs<>allocated
 OR EXISTS(SELECT 1 FROM "InventoryBalance" ib WHERE ib."productId"=pid AND ib."quantityReserved"<>(
   SELECT COALESCE(sum(ia.quantity),0) FROM "InventoryAllocation" ia WHERE ia."productId"=pid AND ia."locationId"=ib."locationId" AND ia.status='RESERVED'))
 OR EXISTS(SELECT 1 FROM "InventoryAllocation" ia JOIN "OrderItem" oi ON oi.id=ia."orderItemId" WHERE ia."productId"=pid AND oi."productListingId" IS DISTINCT FROM ia."productId") THEN
  RAISE EXCEPTION 'Mapped inventory mismatch for product %',pid USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
