-- E30 lot 1 (docs/crm-v1/ENRICHISSEMENT.md): registry identity on companies, BODACC signals, campaign watches.
-- Additive: the code already in production ignores the new columns and tables.

-- CreateEnum
CREATE TYPE "LegalState" AS ENUM ('ACTIVE', 'INSOLVENT', 'CLOSED');

-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('EXECUTIVE', 'DECISION_MAKER', 'OTHER');

-- CreateEnum
CREATE TYPE "SignalKind" AS ENUM ('CREATED', 'TAKEOVER', 'NEW_LEADER', 'MOVED', 'NEW_SITE', 'INSOLVENCY', 'CLOSED');

-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'REGISTRY';

-- AlterEnum
ALTER TYPE "EnrollmentStopReason" ADD VALUE 'LEGAL_STATE';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "foundedOn" DATE,
ADD COLUMN     "headcountBand" TEXT,
ADD COLUMN     "identityCheckedAt" TIMESTAMP(3),
ADD COLUMN     "legalOverrideAt" TIMESTAMP(3),
ADD COLUMN     "legalOverrideById" TEXT,
ADD COLUMN     "legalState" "LegalState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "legalStateAt" TIMESTAMP(3),
ADD COLUMN     "nafCode" TEXT,
ADD COLUMN     "siren" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "role" "ContactRole" NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "CompanySignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "SignalKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "externalKey" TEXT NOT NULL,
    "watchId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignWatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ownerId" TEXT,
    "kinds" "SignalKind"[],
    "departments" TEXT[],
    "sectors" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "nextRunAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "cursorDay" DATE,
    "lastRunAt" TIMESTAMP(3),
    "lastReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalSweep" (
    "workspaceId" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "cursorDay" DATE,
    "lastRunAt" TIMESTAMP(3),
    "lastReport" JSONB,

    CONSTRAINT "SignalSweep_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateIndex
CREATE INDEX "CompanySignal_workspaceId_occurredAt_idx" ON "CompanySignal"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "CompanySignal_companyId_occurredAt_idx" ON "CompanySignal"("companyId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySignal_companyId_externalKey_key" ON "CompanySignal"("companyId", "externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignWatch_campaignId_key" ON "CampaignWatch"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignWatch_active_nextRunAt_idx" ON "CampaignWatch"("active", "nextRunAt");

-- CreateIndex
CREATE INDEX "Company_workspaceId_siren_idx" ON "Company"("workspaceId", "siren");

-- CreateIndex
CREATE INDEX "Company_identityCheckedAt_idx" ON "Company"("identityCheckedAt");

-- AddForeignKey
ALTER TABLE "CompanySignal" ADD CONSTRAINT "CompanySignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySignal" ADD CONSTRAINT "CompanySignal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySignal" ADD CONSTRAINT "CompanySignal_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "CampaignWatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignWatch" ADD CONSTRAINT "CampaignWatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignWatch" ADD CONSTRAINT "CampaignWatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignWatch" ADD CONSTRAINT "CampaignWatch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalSweep" ADD CONSTRAINT "SignalSweep_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: the SIREN fiches already carry (their SIRET, or the Extractor's raw data), and the Extractor's NAF code.

UPDATE "Company" SET "siren" = substr("siret", 1, 9) WHERE "siren" IS NULL AND "siret" ~ '^[0-9]{14}$';

UPDATE "Company" SET "siren" = "data"->>'siren' WHERE "siren" IS NULL AND jsonb_typeof("data") = 'object' AND ("data"->>'siren') ~ '^[0-9]{9}$';

UPDATE "Company" SET "nafCode" = "data"->>'naf' WHERE "nafCode" IS NULL AND jsonb_typeof("data") = 'object' AND ("data"->>'naf') ~ '^[0-9]{2}\.[0-9]{2}[A-Z]$';
