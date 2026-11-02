-- E20 prospect audits (docs/crm-v1/AGENTS-IA.md §13). Additive: one enum, two tables.
-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('COMPLETE', 'PARTIAL');

-- CreateTable
CREATE TABLE "ProspectAudit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT,
    "companyId" TEXT,
    "runId" TEXT,
    "domain" TEXT,
    "url" TEXT,
    "status" "AuditStatus" NOT NULL,
    "scores" JSONB NOT NULL,
    "score" INTEGER,
    "summary" TEXT[],
    "report" JSONB NOT NULL,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectAuditCapture" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectAuditCapture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProspectAudit_runId_key" ON "ProspectAudit"("runId");

-- CreateIndex
CREATE INDEX "ProspectAudit_workspaceId_domain_createdAt_idx" ON "ProspectAudit"("workspaceId", "domain", "createdAt");

-- CreateIndex
CREATE INDEX "ProspectAudit_leadId_createdAt_idx" ON "ProspectAudit"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectAuditCapture_auditId_kind_key" ON "ProspectAuditCapture"("auditId", "kind");

-- AddForeignKey
ALTER TABLE "ProspectAudit" ADD CONSTRAINT "ProspectAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectAudit" ADD CONSTRAINT "ProspectAudit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectAudit" ADD CONSTRAINT "ProspectAudit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectAudit" ADD CONSTRAINT "ProspectAudit_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectAuditCapture" ADD CONSTRAINT "ProspectAuditCapture_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "ProspectAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Business rules the application also checks.
ALTER TABLE "ProspectAudit" ADD CONSTRAINT "ProspectAudit_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100));
ALTER TABLE "ProspectAuditCapture" ADD CONSTRAINT "ProspectAuditCapture_kind_check" CHECK ("kind" IN ('mobile', 'desktop'));
