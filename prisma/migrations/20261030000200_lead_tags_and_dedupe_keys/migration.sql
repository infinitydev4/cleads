-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "nameKey" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Company_workspaceId_nameKey_idx" ON "Company"("workspaceId", "nameKey");

-- CreateIndex
CREATE INDEX "Company_workspaceId_siret_idx" ON "Company"("workspaceId", "siret");

-- CreateIndex
CREATE INDEX "Company_workspaceId_phone_idx" ON "Company"("workspaceId", "phone");

-- CreateIndex
CREATE INDEX "Lead_tags_idx" ON "Lead" USING GIN ("tags");

