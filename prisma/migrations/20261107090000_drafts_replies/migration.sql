-- E22 drafting and replies (docs/crm-v1/AGENTS-IA.md §15). Additive: three enums, two tables.
-- CreateEnum
CREATE TYPE "DraftKind" AS ENUM ('FIRST_EMAIL', 'REPLY', 'SEQUENCE_STEP');

-- CreateEnum
CREATE TYPE "ReplyUrgency" AS ENUM ('HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "TriageOutcome" AS ENUM ('AUTO', 'REVIEW', 'HUMAN');

-- CreateTable
CREATE TABLE "EmailDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "DraftKind" NOT NULL,
    "leadId" TEXT,
    "replyToId" TEXT,
    "auditId" TEXT,
    "runId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "facts" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentEmailId" TEXT,
    "editRatio" DOUBLE PRECISION,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplyTriage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "runId" TEXT,
    "replyClass" "ReplyClass",
    "classConfidence" DOUBLE PRECISION,
    "outcome" "TriageOutcome" NOT NULL,
    "urgency" "ReplyUrgency",
    "urgencyConfidence" DOUBLE PRECISION,
    "needsAction" BOOLEAN,
    "actionConfidence" DOUBLE PRECISION,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplyTriage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDraft_runId_key" ON "EmailDraft"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDraft_sentEmailId_key" ON "EmailDraft"("sentEmailId");

-- CreateIndex
CREATE INDEX "EmailDraft_workspaceId_createdAt_idx" ON "EmailDraft"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailDraft_leadId_createdAt_idx" ON "EmailDraft"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReplyTriage_emailId_key" ON "ReplyTriage"("emailId");

-- CreateIndex
CREATE INDEX "ReplyTriage_workspaceId_createdAt_idx" ON "ReplyTriage"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "ProspectAudit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_sentEmailId_fkey" FOREIGN KEY ("sentEmailId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyTriage" ADD CONSTRAINT "ReplyTriage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyTriage" ADD CONSTRAINT "ReplyTriage_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyTriage" ADD CONSTRAINT "ReplyTriage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Business rules the application also checks.
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_target_check" CHECK (
  ("kind" = 'REPLY') = ("replyToId" IS NOT NULL)
  AND ("kind" <> 'FIRST_EMAIL' OR "leadId" IS NOT NULL)
  AND ("kind" <> 'SEQUENCE_STEP' OR "leadId" IS NULL)
);
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_edit_check" CHECK ("editRatio" IS NULL OR ("editRatio" >= 0 AND "editRatio" <= 1));
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_sent_check" CHECK ("sentEmailId" IS NULL OR "sentAt" IS NOT NULL);
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_cost_check" CHECK ("costMicros" >= 0);
ALTER TABLE "ReplyTriage" ADD CONSTRAINT "ReplyTriage_confidence_check" CHECK (
  ("classConfidence" IS NULL OR ("classConfidence" >= 0 AND "classConfidence" <= 1))
  AND ("urgencyConfidence" IS NULL OR ("urgencyConfidence" >= 0 AND "urgencyConfidence" <= 1))
  AND ("actionConfidence" IS NULL OR ("actionConfidence" >= 0 AND "actionConfidence" <= 1))
);
