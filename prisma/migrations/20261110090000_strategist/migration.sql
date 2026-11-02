-- E25 Stratège et sourcing (docs/crm-v1/AGENTS-IA.md §17). Additive: two enums, three tables, one column.
-- CreateEnum
CREATE TYPE "StrategyTargetStatus" AS ENUM ('PROPOSED', 'CAMPAIGN', 'LAUNCHED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "RelevanceVerdict" AS ENUM ('RELEVANT', 'MAYBE', 'NOT_RELEVANT');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "offerId" TEXT;

-- CreateTable
CREATE TABLE "StrategyProposal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT,
    "requestedById" TEXT,
    "brief" JSONB NOT NULL,
    "summary" TEXT,
    "sectorsFrom" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyTarget" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "sector" TEXT NOT NULL,
    "sectorKey" TEXT,
    "zones" TEXT[],
    "pains" TEXT[],
    "offerId" TEXT,
    "offerName" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "rationale" JSONB NOT NULL,
    "campaignName" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "maxResults" INTEGER NOT NULL,
    "knownCount" INTEGER,
    "status" "StrategyTargetStatus" NOT NULL DEFAULT 'PROPOSED',
    "campaignId" TEXT,
    "searchId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadRelevance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "offerName" TEXT,
    "runId" TEXT,
    "verdict" "RelevanceVerdict",
    "confidence" DOUBLE PRECISION,
    "outcome" "TriageOutcome" NOT NULL,
    "model" TEXT NOT NULL,
    "decision" "RelevanceVerdict",
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadRelevance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StrategyProposal_runId_key" ON "StrategyProposal"("runId");

-- CreateIndex
CREATE INDEX "StrategyProposal_workspaceId_createdAt_idx" ON "StrategyProposal"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyTarget_proposalId_rank_key" ON "StrategyTarget"("proposalId", "rank");

-- CreateIndex
CREATE INDEX "LeadRelevance_campaignId_outcome_idx" ON "LeadRelevance"("campaignId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "LeadRelevance_leadId_campaignId_key" ON "LeadRelevance"("leadId", "campaignId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyProposal" ADD CONSTRAINT "StrategyProposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyProposal" ADD CONSTRAINT "StrategyProposal_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyProposal" ADD CONSTRAINT "StrategyProposal_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyTarget" ADD CONSTRAINT "StrategyTarget_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "StrategyProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyTarget" ADD CONSTRAINT "StrategyTarget_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyTarget" ADD CONSTRAINT "StrategyTarget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyTarget" ADD CONSTRAINT "StrategyTarget_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "ExtractionSearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadRelevance" ADD CONSTRAINT "LeadRelevance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadRelevance" ADD CONSTRAINT "LeadRelevance_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadRelevance" ADD CONSTRAINT "LeadRelevance_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadRelevance" ADD CONSTRAINT "LeadRelevance_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Business rules the application also checks.
ALTER TABLE "StrategyTarget" ADD CONSTRAINT "StrategyTarget_numbers_check" CHECK ("rank" >= 1 AND "maxResults" BETWEEN 10 AND 1000 AND ("knownCount" IS NULL OR "knownCount" >= 0));
ALTER TABLE "LeadRelevance" ADD CONSTRAINT "LeadRelevance_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
