-- E32 lot 1 (Zadarma telephony): each member's PBX extension, and the calls the PBX reports, one row per provider call.
-- Additive: the code already in production ignores the new column and table.

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "zadarmaExtension" TEXT;

-- CreateTable
CREATE TABLE "PhoneCall" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'zadarma',
    "externalId" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "userId" TEXT,
    "leadId" TEXT,
    "extension" TEXT,
    "number" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "disposition" TEXT NOT NULL,
    "recordingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhoneCall_workspaceId_startedAt_idx" ON "PhoneCall"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "PhoneCall_userId_startedAt_idx" ON "PhoneCall"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "PhoneCall_leadId_startedAt_idx" ON "PhoneCall"("leadId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneCall_provider_externalId_key" ON "PhoneCall"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "User_workspaceId_zadarmaExtension_key" ON "User"("workspaceId", "zadarmaExtension");

-- AddForeignKey
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

