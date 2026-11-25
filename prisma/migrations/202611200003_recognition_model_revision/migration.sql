ALTER TABLE "ProductRecognitionTask" ADD COLUMN "modelRevision" TEXT NOT NULL DEFAULT 'unverified-legacy';
ALTER TABLE "ProductRecognitionTask" ALTER COLUMN "modelRevision" DROP DEFAULT;
