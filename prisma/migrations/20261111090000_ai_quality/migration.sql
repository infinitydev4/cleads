-- E27 Qualité de l'IA (docs/crm-v1/AGENTS-IA.md §20). Additive: two tables.
-- CreateTable
CREATE TABLE "AiEvaluation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "suite" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "contenders" TEXT[],
    "source" TEXT NOT NULL,
    "datasetVersion" TEXT NOT NULL,
    "caseIds" TEXT[],
    "agentVersion" INTEGER NOT NULL DEFAULT 0,
    "judgeModel" TEXT,
    "estimateMicros" INTEGER NOT NULL,
    "results" JSONB,
    "runId" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AiEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEvaluationCase" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "contender" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION,
    "detail" JSONB NOT NULL,
    "error" TEXT,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "judgeMicros" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvaluationCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiEvaluation_runId_key" ON "AiEvaluation"("runId");

-- CreateIndex
CREATE INDEX "AiEvaluation_workspaceId_suite_createdAt_idx" ON "AiEvaluation"("workspaceId", "suite", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiEvaluationCase_evaluationId_contender_caseId_key" ON "AiEvaluationCase"("evaluationId", "contender", "caseId");

-- AddForeignKey
ALTER TABLE "AiEvaluation" ADD CONSTRAINT "AiEvaluation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluation" ADD CONSTRAINT "AiEvaluation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluation" ADD CONSTRAINT "AiEvaluation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationCase" ADD CONSTRAINT "AiEvaluationCase_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "AiEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

