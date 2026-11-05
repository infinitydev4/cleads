-- E10 lot 1 (docs/crm-v1/PLAN.md, D56 and D57): who created an opportunity, so the reports credit the SDR who qualified it.
-- Additive: the code already in production ignores the new column; opportunities from before stay without an author.

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Deal_workspaceId_createdById_createdAt_idx" ON "Deal"("workspaceId", "createdById", "createdAt");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
