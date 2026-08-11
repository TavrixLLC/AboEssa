-- Phase E is additive. Existing AdminUser rows are backfilled before required
-- columns and the unique normalized-email index are enforced.
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

ALTER TABLE "AdminUser"
  ADD COLUMN "normalizedEmail" TEXT,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "jobTitle" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "deniedPermissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN "deactivatedAt" TIMESTAMP(3),
  ADD COLUMN "deactivatedById" TEXT;

UPDATE "AdminUser"
SET
  "normalizedEmail" = lower(trim("email")),
  "displayName" = "name",
  "status" = CASE WHEN "isActive" THEN 'ACTIVE'::"StaffStatus" ELSE 'INACTIVE'::"StaffStatus" END,
  "isOwner" = ("role" = 'OWNER'::"AdminRole");

ALTER TABLE "AdminUser"
  ALTER COLUMN "normalizedEmail" SET NOT NULL;

CREATE UNIQUE INDEX "AdminUser_normalizedEmail_key" ON "AdminUser"("normalizedEmail");
CREATE INDEX "AdminUser_status_idx" ON "AdminUser"("status");
CREATE INDEX "AdminUser_isOwner_status_idx" ON "AdminUser"("isOwner", "status");

CREATE TABLE "Role" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "permissionKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

CREATE TABLE "AdminUserRole" (
  "adminUserId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminUserRole_pkey" PRIMARY KEY ("adminUserId", "roleId"),
  CONSTRAINT "AdminUserRole_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdminUserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AdminUserRole_roleId_idx" ON "AdminUserRole"("roleId");

CREATE TABLE "AdminSession" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "deviceName" TEXT,
  "platform" TEXT,
  "appVersion" TEXT,
  "ipAddress" TEXT,
  "userAgentSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminSession_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AdminSession_adminUserId_revokedAt_idx" ON "AdminSession"("adminUserId", "revokedAt");
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

ALTER TABLE "AuditLog" ADD COLUMN "summary" TEXT;

ALTER TABLE "AdminUser"
  ADD CONSTRAINT "AdminUser_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AdminUser_deactivatedById_idx" ON "AdminUser"("deactivatedById");
