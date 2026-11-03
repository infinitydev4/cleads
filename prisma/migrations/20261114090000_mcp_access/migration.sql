-- E29 Le serveur MCP du CRM, lot 1 (docs/crm-v1/AGENTS-IA.md §9). Additive: the members' personal tokens (only their
-- hash), the tokens' activity, the owner's switch (off by default, D39) and the MCP clients' rights matrix (D38).
-- CreateEnum
CREATE TYPE "McpCallOutcome" AS ENUM ('DONE', 'PENDING', 'REFUSED', 'ERROR');

-- AlterTable
ALTER TABLE "AiSetting" ADD COLUMN     "mcpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mcpPolicy" JSONB;

-- CreateTable
CREATE TABLE "McpToken" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "lastClient" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpCall" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "client" TEXT,
    "outcome" "McpCallOutcome" NOT NULL,
    "approvalId" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpToken_tokenHash_key" ON "McpToken"("tokenHash");

-- CreateIndex
CREATE INDEX "McpToken_workspaceId_userId_idx" ON "McpToken"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "McpCall_tokenId_createdAt_idx" ON "McpCall"("tokenId", "createdAt");

-- CreateIndex
CREATE INDEX "McpCall_workspaceId_createdAt_idx" ON "McpCall"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpCall" ADD CONSTRAINT "McpCall_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpCall" ADD CONSTRAINT "McpCall_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "McpToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

