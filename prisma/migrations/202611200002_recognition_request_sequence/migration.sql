-- A DB-locked per-session order, independent of wall-clock ties or distributed CUID ordering.
ALTER TABLE "ProductRecognitionRequest" ADD COLUMN "sequence" INTEGER;
WITH ordered AS (
 SELECT id,row_number() OVER (PARTITION BY "sessionId" ORDER BY "createdAt",id) AS position
 FROM "ProductRecognitionRequest"
) UPDATE "ProductRecognitionRequest" r SET "sequence"=ordered.position FROM ordered WHERE ordered.id=r.id;
ALTER TABLE "ProductRecognitionRequest" ALTER COLUMN "sequence" SET NOT NULL;
CREATE UNIQUE INDEX "ProductRecognitionRequest_sessionId_sequence_key" ON "ProductRecognitionRequest"("sessionId","sequence");
