-- E21 offers and pitch (docs/crm-v1/AGENTS-IA.md §14). Additive: three enums, two tables.
-- CreateEnum
CREATE TYPE "RecommendationRole" AS ENUM ('MAIN', 'COMPLEMENT', 'ENTRY', 'LATER');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('SUGGESTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('NOT_RELEVANT', 'TOO_EXPENSIVE', 'ALREADY_HAS', 'BAD_TIMING', 'OTHER');

-- CreateTable
CREATE TABLE "OfferPitch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "auditId" TEXT,
    "runId" TEXT,
    "headline" TEXT NOT NULL,
    "script" JSONB NOT NULL,
    "objections" JSONB NOT NULL,
    "emailAngle" JSONB,
    "evidence" JSONB NOT NULL,
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferPitch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferRecommendation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pitchId" TEXT NOT NULL,
    "offerId" TEXT,
    "rank" INTEGER NOT NULL,
    "role" "RecommendationRole" NOT NULL,
    "offerSlug" TEXT NOT NULL,
    "offerName" TEXT NOT NULL,
    "category" "OfferCategory" NOT NULL,
    "priceMinEur" INTEGER,
    "priceMaxEur" INTEGER,
    "billing" "OfferBilling" NOT NULL,
    "priceNote" TEXT,
    "fit" INTEGER NOT NULL,
    "signals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "why" TEXT NOT NULL,
    "gain" TEXT NOT NULL,
    "evidence" TEXT[],
    "objection" TEXT,
    "answer" TEXT,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'SUGGESTED',
    "reason" "RejectionReason",
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfferPitch_runId_key" ON "OfferPitch"("runId");

-- CreateIndex
CREATE INDEX "OfferPitch_leadId_createdAt_idx" ON "OfferPitch"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "OfferPitch_workspaceId_createdAt_idx" ON "OfferPitch"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "OfferRecommendation_workspaceId_status_idx" ON "OfferRecommendation"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "OfferRecommendation_offerId_status_idx" ON "OfferRecommendation"("offerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OfferRecommendation_pitchId_offerSlug_key" ON "OfferRecommendation"("pitchId", "offerSlug");

-- CreateIndex
CREATE UNIQUE INDEX "OfferRecommendation_pitchId_rank_key" ON "OfferRecommendation"("pitchId", "rank");

-- AddForeignKey
ALTER TABLE "OfferPitch" ADD CONSTRAINT "OfferPitch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferPitch" ADD CONSTRAINT "OfferPitch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferPitch" ADD CONSTRAINT "OfferPitch_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "ProspectAudit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferPitch" ADD CONSTRAINT "OfferPitch_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRecommendation" ADD CONSTRAINT "OfferRecommendation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRecommendation" ADD CONSTRAINT "OfferRecommendation_pitchId_fkey" FOREIGN KEY ("pitchId") REFERENCES "OfferPitch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRecommendation" ADD CONSTRAINT "OfferRecommendation_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Business rules the application also checks. No offer without at least one piece of audit evidence.
ALTER TABLE "OfferRecommendation" ADD CONSTRAINT "OfferRecommendation_evidence_check" CHECK (COALESCE(cardinality("evidence"), 0) >= 1);
ALTER TABLE "OfferRecommendation" ADD CONSTRAINT "OfferRecommendation_fit_check" CHECK ("fit" >= 0 AND "fit" <= 100);
ALTER TABLE "OfferRecommendation" ADD CONSTRAINT "OfferRecommendation_rank_check" CHECK ("rank" >= 1);
ALTER TABLE "OfferRecommendation" ADD CONSTRAINT "OfferRecommendation_reason_check" CHECK ("reason" IS NULL OR "status" = 'REJECTED');
ALTER TABLE "OfferRecommendation" ADD CONSTRAINT "OfferRecommendation_decided_check" CHECK (("status" = 'SUGGESTED') = ("decidedAt" IS NULL));
ALTER TABLE "OfferPitch" ADD CONSTRAINT "OfferPitch_cost_check" CHECK ("costMicros" >= 0);
