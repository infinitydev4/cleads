-- E30 lot 2 (docs/crm-v1/ENRICHISSEMENT.md): decision makers and social profiles found with Exa, meeting briefs of the
-- Enquêteur, GEO probe with Perplexity. Additive: the code already in production ignores the new columns and tables.

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('PROBABLE', 'TO_CHECK', 'CONFIRMED', 'DISMISSED');

-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'RESEARCH';

-- AlterEnum
ALTER TYPE "SignalKind" ADD VALUE 'GEO_ABSENT';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "geoCheckedAt" TIMESTAMP(3),
ADD COLUMN     "peopleCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "linkedinUrl" TEXT;

-- CreateTable
CREATE TABLE "ContactCandidate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "ContactRole" NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'TO_CHECK',
    "contactId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadBrief" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "meetingId" TEXT,
    "runId" TEXT,
    "content" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "dropped" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactCandidate_workspaceId_status_idx" ON "ContactCandidate"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContactCandidate_companyId_url_key" ON "ContactCandidate"("companyId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "LeadBrief_runId_key" ON "LeadBrief"("runId");

-- CreateIndex
CREATE INDEX "LeadBrief_leadId_createdAt_idx" ON "LeadBrief"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadBrief_meetingId_idx" ON "LeadBrief"("meetingId");

-- AddForeignKey
ALTER TABLE "ContactCandidate" ADD CONSTRAINT "ContactCandidate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactCandidate" ADD CONSTRAINT "ContactCandidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadBrief" ADD CONSTRAINT "LeadBrief_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadBrief" ADD CONSTRAINT "LeadBrief_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadBrief" ADD CONSTRAINT "LeadBrief_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadBrief" ADD CONSTRAINT "LeadBrief_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

