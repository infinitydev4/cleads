-- CreateEnum
CREATE TYPE "SearchStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ExtractionSearch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "extractorJobId" TEXT,
    "label" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "status" "SearchStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "counters" JSONB,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "lastImportAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ExtractionSearch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionSearch_extractorJobId_key" ON "ExtractionSearch"("extractorJobId");

-- CreateIndex
CREATE INDEX "ExtractionSearch_workspaceId_createdAt_idx" ON "ExtractionSearch"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionSearch_createdById_status_idx" ON "ExtractionSearch"("createdById", "status");

-- AddForeignKey
ALTER TABLE "ExtractionSearch" ADD CONSTRAINT "ExtractionSearch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionSearch" ADD CONSTRAINT "ExtractionSearch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

