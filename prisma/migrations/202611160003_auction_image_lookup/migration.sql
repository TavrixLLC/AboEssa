CREATE INDEX CONCURRENTLY "Auction_imageUrls_idx" ON "Auction" USING GIN ("imageUrls");
