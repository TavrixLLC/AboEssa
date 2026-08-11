CREATE INDEX "LiveSession_status_scheduledAt_idx" ON "LiveSession"("status", "scheduledAt");
CREATE UNIQUE INDEX "LiveSession_one_live_idx" ON "LiveSession"("status") WHERE "status" = 'LIVE';
