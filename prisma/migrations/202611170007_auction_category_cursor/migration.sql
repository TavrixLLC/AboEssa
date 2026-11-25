CREATE INDEX CONCURRENTLY "Auction_catalog_category_cursor_idx" ON "Auction" ("categoryId", "createdAt" DESC, "id" DESC)
WHERE "status" = 'ACTIVE';
