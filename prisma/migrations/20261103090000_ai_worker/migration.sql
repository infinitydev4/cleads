-- E18 AI worker (docs/crm-v1/AGENTS-IA.md §10). Additive: queue columns on AgentRun, at-most-once columns on AgentApproval, one table.
-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "heartbeatAt" TIMESTAMP(3),
ADD COLUMN     "lockedBy" TEXT,
ADD COLUMN     "notBefore" TIMESTAMP(3),
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AgentApproval" ADD COLUMN     "executedAt" TIMESTAMP(3),
ADD COLUMN     "executionStartedAt" TIMESTAMP(3),
ADD COLUMN     "result" JSONB;

-- CreateTable
CREATE TABLE "AiWorker" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "host" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "beatAt" TIMESTAMP(3) NOT NULL,
    "running" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiWorker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_status_priority_createdAt_idx" ON "AgentRun"("status", "priority", "createdAt");


-- One run of an agent at a time on a fiche: a second audit of the same fiche waits for the first.
CREATE UNIQUE INDEX "AgentRun_one_active_per_lead_agent" ON "AgentRun"("leadId", "agentId") WHERE "leadId" IS NOT NULL AND "status" IN ('QUEUED', 'RUNNING', 'WAITING_APPROVAL');

-- Rules Prisma cannot express.
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "AiWorker" ADD CONSTRAINT "AiWorker_running_check" CHECK ("running" >= 0);
