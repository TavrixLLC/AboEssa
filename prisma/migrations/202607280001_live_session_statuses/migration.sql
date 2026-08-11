-- PostgreSQL requires enum values to be committed before they are used by an index or query.
ALTER TYPE "LiveSessionStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "LiveSessionStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "LiveSessionStatus" ADD VALUE IF NOT EXISTS 'LIVE';
ALTER TYPE "LiveSessionStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
