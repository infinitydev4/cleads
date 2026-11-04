-- E29 Le serveur MCP du CRM, lot 2 : OAuth (docs/crm-v1/AGENTS-IA.md §9). Additive: the OAuth clients (CIMD documents
-- read again hourly, or dynamic registrations), the authorization codes and the connections' access tokens (only their
-- hashes), and on McpToken what an OAuth connection needs (its client, reuse detection of the rotated refresh token).
-- CreateEnum
CREATE TYPE "McpOAuthClientKind" AS ENUM ('CIMD', 'DCR');

-- AlterTable
ALTER TABLE "McpToken" ADD COLUMN     "oauthClientId" TEXT,
ADD COLUMN     "previousHash" TEXT,
ADD COLUMN     "redirectUri" TEXT,
ADD COLUMN     "resource" TEXT,
ADD COLUMN     "rotatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "McpOAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "McpOAuthClientKind" NOT NULL,
    "name" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "tokenAuthMethod" TEXT NOT NULL DEFAULT 'none',
    "secretHash" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpOAuthCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "oauthClientId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "readOnly" BOOLEAN NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "tokenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpAccessToken" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthClient_clientId_key" ON "McpOAuthClient"("clientId");

-- CreateIndex
CREATE INDEX "McpOAuthClient_kind_createdAt_idx" ON "McpOAuthClient"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthCode_codeHash_key" ON "McpOAuthCode"("codeHash");

-- CreateIndex
CREATE INDEX "McpOAuthCode_expiresAt_idx" ON "McpOAuthCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpAccessToken_hash_key" ON "McpAccessToken"("hash");

-- CreateIndex
CREATE INDEX "McpAccessToken_tokenId_idx" ON "McpAccessToken"("tokenId");

-- CreateIndex
CREATE INDEX "McpAccessToken_expiresAt_idx" ON "McpAccessToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpToken_previousHash_key" ON "McpToken"("previousHash");

-- CreateIndex
CREATE INDEX "McpToken_oauthClientId_idx" ON "McpToken"("oauthClientId");

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_oauthClientId_fkey" FOREIGN KEY ("oauthClientId") REFERENCES "McpOAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthCode" ADD CONSTRAINT "McpOAuthCode_oauthClientId_fkey" FOREIGN KEY ("oauthClientId") REFERENCES "McpOAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthCode" ADD CONSTRAINT "McpOAuthCode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthCode" ADD CONSTRAINT "McpOAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthCode" ADD CONSTRAINT "McpOAuthCode_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpAccessToken" ADD CONSTRAINT "McpAccessToken_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "McpToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

