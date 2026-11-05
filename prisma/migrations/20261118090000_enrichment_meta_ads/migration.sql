-- E30 lot 3 (docs/crm-v1/ENRICHISSEMENT.md): the ads a company runs now, read in Meta's Ad Library by the worker.
-- Additive: the code already in production ignores the new value and columns.

-- AlterEnum
ALTER TYPE "SignalKind" ADD VALUE 'ADS_RUNNING';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "adsCheckedAt" TIMESTAMP(3),
ADD COLUMN     "adsRequestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AiWorker" ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "SignalSweep" ADD COLUMN     "metaNotice" TEXT;

-- CreateIndex
CREATE INDEX "Company_adsCheckedAt_idx" ON "Company"("adsCheckedAt");
