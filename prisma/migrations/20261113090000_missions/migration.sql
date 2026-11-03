-- E28 Le copilote qui agit, lot 2 (docs/crm-v1/AGENTS-IA.md §17). Additive: missions, their steps and schedules,
-- the runs' link to their mission, the cap per mission (D32) and the catalogue's version.
-- CreateEnum
CREATE TYPE "AgentMissionStatus" AS ENUM ('PROPOSED', 'REFUSED', 'EXPIRED', 'RUNNING', 'PAUSED', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentMissionStepStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING', 'DONE', 'SKIPPED', 'FAILED', 'UNCERTAIN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentMissionScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'STOPPED');

-- AlterTable
ALTER TABLE "AiSetting" ADD COLUMN     "catalogVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "missionCapMicros" INTEGER NOT NULL DEFAULT 2000000;

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "missionId" TEXT;

-- CreateTable
CREATE TABLE "AgentMission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestedById" TEXT,
    "title" TEXT NOT NULL,
    "status" "AgentMissionStatus" NOT NULL DEFAULT 'PROPOSED',
    "plan" JSONB NOT NULL,
    "probableMicros" INTEGER NOT NULL DEFAULT 0,
    "maxMicros" INTEGER NOT NULL DEFAULT 0,
    "capMicros" INTEGER NOT NULL DEFAULT 0,
    "conversationId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "scheduleId" TEXT,
    "pauseKind" TEXT,
    "pauseReason" TEXT,
    "report" JSONB,
    "wakeAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMissionStep" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "item" INTEGER NOT NULL DEFAULT 0,
    "action" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "status" "AgentMissionStepStatus" NOT NULL DEFAULT 'PENDING',
    "waitKind" TEXT,
    "waitId" TEXT,
    "output" JSONB,
    "exports" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "notBefore" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMissionStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMissionSchedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestedById" TEXT,
    "title" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "recurrence" JSONB NOT NULL,
    "capMicros" INTEGER NOT NULL,
    "status" "AgentMissionScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "nextRunAt" TIMESTAMP(3),
    "failures" INTEGER NOT NULL DEFAULT 0,
    "pauseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMissionSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentMission_workspaceId_createdAt_idx" ON "AgentMission"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentMission_requestedById_createdAt_idx" ON "AgentMission"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "AgentMission_status_wakeAt_idx" ON "AgentMission"("status", "wakeAt");

-- CreateIndex
CREATE INDEX "AgentMission_conversationId_idx" ON "AgentMission"("conversationId");

-- CreateIndex
CREATE INDEX "AgentMissionStep_waitKind_waitId_idx" ON "AgentMissionStep"("waitKind", "waitId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMissionStep_missionId_key_item_key" ON "AgentMissionStep"("missionId", "key", "item");

-- CreateIndex
CREATE INDEX "AgentMissionSchedule_status_nextRunAt_idx" ON "AgentMissionSchedule"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "AgentMissionSchedule_requestedById_idx" ON "AgentMissionSchedule"("requestedById");

-- CreateIndex
CREATE INDEX "AgentRun_missionId_idx" ON "AgentRun"("missionId");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "AgentMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMission" ADD CONSTRAINT "AgentMission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMission" ADD CONSTRAINT "AgentMission_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMission" ADD CONSTRAINT "AgentMission_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AgentMissionSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMissionStep" ADD CONSTRAINT "AgentMissionStep_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "AgentMission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMissionSchedule" ADD CONSTRAINT "AgentMissionSchedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMissionSchedule" ADD CONSTRAINT "AgentMissionSchedule_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

