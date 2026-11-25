CREATE INDEX CONCURRENTLY "ProductListing_imageUrls_idx" ON "ProductListing" USING GIN ("imageUrls");
