CREATE INDEX CONCURRENTLY "Auction_catalog_cursor_idx" ON "Auction" ("createdAt" DESC, "id" DESC)
WHERE "status" = 'ACTIVE';
