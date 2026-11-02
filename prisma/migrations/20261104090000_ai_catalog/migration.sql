-- E19 agents, skills and offers (docs/crm-v1/AGENTS-IA.md §7, §8 and §14). Additive: one column on AiSetting, six tables.
-- CreateEnum
CREATE TYPE "SkillMode" AS ENUM ('ALWAYS', 'ON_DEMAND');

-- CreateEnum
CREATE TYPE "OfferCategory" AS ENUM ('WEBSITE', 'SEO', 'GEO', 'SOCIAL', 'ADS', 'PACK', 'RETAINER');

-- CreateEnum
CREATE TYPE "OfferBilling" AS ENUM ('ONE_OFF', 'MONTHLY', 'QUOTE');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "AiSetting" ADD COLUMN     "catalogSeededAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AgentDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "instructions" TEXT,
    "modelRole" TEXT,
    "maxSteps" INTEGER,
    "maxCostMicros" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDefinitionVersion" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changes" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDefinitionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "generator" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillVersion" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "files" JSONB,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSkill" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "mode" "SkillMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "OfferCategory" NOT NULL,
    "summary" TEXT NOT NULL,
    "deliverables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priceMinEur" INTEGER,
    "priceMaxEur" INTEGER,
    "billing" "OfferBilling" NOT NULL DEFAULT 'ONE_OFF',
    "priceNote" TEXT,
    "angle" TEXT,
    "objections" JSONB,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentDefinition_workspaceId_agentId_key" ON "AgentDefinition"("workspaceId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDefinitionVersion_definitionId_version_key" ON "AgentDefinitionVersion"("definitionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_workspaceId_name_key" ON "Skill"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SkillVersion_skillId_version_key" ON "SkillVersion"("skillId", "version");

-- CreateIndex
CREATE INDEX "AgentSkill_workspaceId_agentId_idx" ON "AgentSkill"("workspaceId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSkill_skillId_agentId_key" ON "AgentSkill"("skillId", "agentId");

-- CreateIndex
CREATE INDEX "Offer_workspaceId_status_idx" ON "Offer"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_workspaceId_slug_key" ON "Offer"("workspaceId", "slug");

-- AddForeignKey
ALTER TABLE "AgentDefinition" ADD CONSTRAINT "AgentDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDefinitionVersion" ADD CONSTRAINT "AgentDefinitionVersion_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "AgentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillVersion" ADD CONSTRAINT "SkillVersion_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkill" ADD CONSTRAINT "AgentSkill_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkill" ADD CONSTRAINT "AgentSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Business rules the application also checks.
ALTER TABLE "AgentDefinition" ADD CONSTRAINT "AgentDefinition_limits_check" CHECK (("maxSteps" IS NULL OR "maxSteps" >= 1) AND ("maxCostMicros" IS NULL OR "maxCostMicros" > 0));
ALTER TABLE "SkillVersion" ADD CONSTRAINT "SkillVersion_version_check" CHECK ("version" >= 1);
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_price_check" CHECK (("priceMinEur" IS NULL OR "priceMinEur" >= 0) AND ("priceMaxEur" IS NULL OR "priceMinEur" IS NULL OR "priceMaxEur" >= "priceMinEur"));
