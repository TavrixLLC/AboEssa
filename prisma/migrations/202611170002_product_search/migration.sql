CREATE INDEX CONCURRENTLY "ProductListing_catalog_search_idx" ON "ProductListing"
USING GIN (catalog_search("title") gin_trgm_ops, catalog_search(COALESCE("description", '')) gin_trgm_ops);
