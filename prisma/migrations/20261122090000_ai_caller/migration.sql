-- CreateEnum
CREATE TYPE "AiWaveStatus" AS ENUM ('RUNNING', 'PAUSED', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "AiCallStatus" AS ENUM ('QUEUED', 'DIALING', 'DONE', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AiCallOutcome" AS ENUM ('MEETING', 'CALLBACK', 'NOT_INTERESTED', 'VOICEMAIL', 'NO_ANSWER', 'DO_NOT_CALL', 'FAILED');

-- CreateTable
CREATE TABLE "AiCallSetting" (
    "workspaceId" TEXT NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "agentId" TEXT,
    "phoneNumberId" TEXT,
    "voiceId" TEXT,
    "hostId" TEXT,
    "meetingFormat" TEXT NOT NULL DEFAULT 'meet',
    "hooks" JSONB,
    "monthlyCapCents" INTEGER NOT NULL DEFAULT 6000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCallSetting_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "AiCallWave" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "meetingFormat" TEXT NOT NULL DEFAULT 'meet',
    "hookMode" TEXT NOT NULL DEFAULT 'auto',
    "status" "AiWaveStatus" NOT NULL DEFAULT 'RUNNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCallWave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "waveId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "AiCallStatus" NOT NULL DEFAULT 'QUEUED',
    "outcome" "AiCallOutcome",
    "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token" TEXT NOT NULL,
    "conversationId" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "transcript" JSONB,
    "facts" JSONB,
    "meetingId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiCallWave_workspaceId_createdAt_idx" ON "AiCallWave"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiCall_token_key" ON "AiCall"("token");

-- CreateIndex
CREATE UNIQUE INDEX "AiCall_conversationId_key" ON "AiCall"("conversationId");

-- CreateIndex
CREATE INDEX "AiCall_workspaceId_status_notBefore_idx" ON "AiCall"("workspaceId", "status", "notBefore");

-- CreateIndex
CREATE INDEX "AiCall_waveId_status_idx" ON "AiCall"("waveId", "status");

-- CreateIndex
CREATE INDEX "AiCall_leadId_createdAt_idx" ON "AiCall"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "AiCall_workspaceId_createdAt_idx" ON "AiCall"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiCallSetting" ADD CONSTRAINT "AiCallSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCallWave" ADD CONSTRAINT "AiCallWave_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCallWave" ADD CONSTRAINT "AiCallWave_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "AiCallWave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

