CREATE INDEX CONCURRENTLY "ProductListing_catalog_cursor_idx" ON "ProductListing" ("createdAt" DESC, "id" DESC)
WHERE "status" = 'ACTIVE' AND "availableQuantity" > 0;
