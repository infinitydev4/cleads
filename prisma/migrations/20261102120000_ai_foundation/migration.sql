-- E17 AI foundation (docs/crm-v1/AGENTS-IA.md). Additive: five new tables and three enums; no existing row is touched.
-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'BUDGET_EXCEEDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AgentStepType" AS ENUM ('MODEL', 'TOOL', 'DECISION', 'APPROVAL');

-- CreateEnum
CREATE TYPE "AgentApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "AiSetting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "roleModels" JSONB,
    "monthlyCapMicros" INTEGER NOT NULL DEFAULT 100000000,
    "userDailyCapMicros" INTEGER NOT NULL DEFAULT 5000000,
    "eurPerUsd" DOUBLE PRECISION NOT NULL DEFAULT 0.92,
    "alerts" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "userKey" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedById" TEXT,
    "leadId" TEXT,
    "campaignId" TEXT,
    "parentRunId" TEXT,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "capMicros" INTEGER NOT NULL,
    "reservedMicros" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "type" "AgentStepType" NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "input" JSONB,
    "output" JSONB,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "generationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentApproval" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "permission" TEXT,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "AgentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiSetting_workspaceId_key" ON "AiSetting"("workspaceId");

-- CreateIndex
CREATE INDEX "AiUsage_workspaceId_day_idx" ON "AiUsage"("workspaceId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_workspaceId_day_userKey_agentId_model_key" ON "AiUsage"("workspaceId", "day", "userKey", "agentId", "model");

-- CreateIndex
CREATE INDEX "AgentRun_workspaceId_createdAt_idx" ON "AgentRun"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_workspaceId_status_idx" ON "AgentRun"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AgentRun_leadId_createdAt_idx" ON "AgentRun"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_requestedById_createdAt_idx" ON "AgentRun"("requestedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentStep_runId_index_key" ON "AgentStep"("runId", "index");

-- CreateIndex
CREATE INDEX "AgentApproval_workspaceId_status_createdAt_idx" ON "AgentApproval"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentApproval_runId_idx" ON "AgentApproval"("runId");

-- CreateIndex
CREATE INDEX "AgentApproval_requestedById_status_idx" ON "AgentApproval"("requestedById", "status");

-- AddForeignKey
ALTER TABLE "AiSetting" ADD CONSTRAINT "AiSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Rules Prisma cannot express. Amounts are micro-euros and never negative.
ALTER TABLE "AiSetting" ADD CONSTRAINT "AiSetting_caps_check" CHECK ("monthlyCapMicros" >= 0 AND "userDailyCapMicros" >= 0 AND "eurPerUsd" > 0);
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_amounts_check" CHECK ("calls" >= 0 AND "inputTokens" >= 0 AND "outputTokens" >= 0 AND "cachedInputTokens" >= 0 AND "costMicros" >= 0);
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_amounts_check" CHECK ("capMicros" >= 0 AND "reservedMicros" >= 0 AND "costMicros" >= 0 AND "stepCount" >= 0);
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_amounts_check" CHECK ("index" >= 1 AND "costMicros" >= 0 AND "durationMs" >= 0);
