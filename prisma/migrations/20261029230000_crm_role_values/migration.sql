-- Adds the CRM staff roles. Kept separate from the data migration: PostgreSQL cannot use a new
-- enum value in the transaction that creates it.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SDR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLOSER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'VIEWER';
