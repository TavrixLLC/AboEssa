CREATE INDEX CONCURRENTLY "ProductListing_catalog_category_cursor_idx" ON "ProductListing" ("categoryId", "createdAt" DESC, "id" DESC)
WHERE "status" = 'ACTIVE' AND "availableQuantity" > 0;
