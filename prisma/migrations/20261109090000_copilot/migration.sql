-- E24 Copilot (docs/crm-v1/AGENTS-IA.md §17). Additive: one enum, two tables.
-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" JSONB,
    "leadIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "turnStartedAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "uiId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "parts" JSONB NOT NULL,
    "metadata" JSONB,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiConversation_workspaceId_userId_lastMessageAt_idx" ON "AiConversation"("workspaceId", "userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "AiConversation_leadIds_idx" ON "AiConversation" USING GIN ("leadIds");

-- CreateIndex
CREATE INDEX "AiConversation_lastMessageAt_idx" ON "AiConversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "AiMessage_runId_idx" ON "AiMessage"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "AiMessage_conversationId_uiId_key" ON "AiMessage"("conversationId", "uiId");

-- CreateIndex
CREATE UNIQUE INDEX "AiMessage_conversationId_seq_key" ON "AiMessage"("conversationId", "seq");

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Business rules the application also checks.
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_counts_check" CHECK ("messageCount" >= 0 AND "costMicros" >= 0);
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_seq_check" CHECK ("seq" >= 1);
