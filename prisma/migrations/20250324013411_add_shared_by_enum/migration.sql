/*
  Warnings:

  - The `sharedBy` column on the `SharedDocument` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "SharedBy" AS ENUM ('ADMIN', 'USER');

-- AlterTable
ALTER TABLE "SharedDocument" DROP COLUMN "sharedBy",
ADD COLUMN     "sharedBy" "SharedBy" NOT NULL DEFAULT 'USER';
