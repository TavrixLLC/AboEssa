CREATE INDEX CONCURRENTLY "Auction_catalog_search_idx" ON "Auction"
USING GIN (catalog_search("title") gin_trgm_ops, catalog_search(COALESCE("description", '')) gin_trgm_ops);
