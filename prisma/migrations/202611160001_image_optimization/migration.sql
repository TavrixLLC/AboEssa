CREATE TYPE "ImageVariantType" AS ENUM ('PLACEHOLDER', 'THUMBNAIL', 'CATALOG', 'DETAIL');
CREATE TYPE "ImageVariantFormat" AS ENUM ('WEBP', 'JPEG');
CREATE TYPE "ImageJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "FileAssetVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "recipeVersion" TEXT NOT NULL,
    "variantType" "ImageVariantType" NOT NULL,
    "format" "ImageVariantFormat" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL CHECK ("width" > 0),
    "height" INTEGER NOT NULL CHECK ("height" > 0),
    "fileSize" INTEGER NOT NULL CHECK ("fileSize" > 0),
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "FileAssetVariant_storageKey_key" ON "FileAssetVariant"("storageKey");
CREATE UNIQUE INDEX "FileAssetVariant_assetId_recipeVersion_variantType_format_key"
    ON "FileAssetVariant"("assetId", "recipeVersion", "variantType", "format");

CREATE TABLE "FileAssetImageJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "recipeVersion" TEXT NOT NULL,
    "status" "ImageJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sourceHash" TEXT,
    "errorCode" TEXT,
    "nextDispatchAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "FileAssetImageJob_assetId_recipeVersion_key"
    ON "FileAssetImageJob"("assetId", "recipeVersion");
CREATE INDEX "FileAssetImageJob_recipeVersion_status_nextDispatchAt_id_idx"
    ON "FileAssetImageJob"("recipeVersion", "status", "nextDispatchAt", "id");
