-- E23 Studio Web (docs/crm-v1/AGENTS-IA.md §16). Additive: one enum, four tables.
-- CreateEnum
CREATE TYPE "StudioSiteStatus" AS ENUM ('BRIEFING', 'BRIEF_READY', 'BUILDING', 'READY', 'PURGED');

-- CreateTable
CREATE TABLE "GeneratedSite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "auditId" TEXT,
    "status" "StudioSiteStatus" NOT NULL DEFAULT 'BRIEFING',
    "companyName" TEXT NOT NULL,
    "collected" JSONB,
    "brief" JSONB,
    "briefEditedById" TEXT,
    "briefEditedAt" TIMESTAMP(3),
    "lastRunId" TEXT,
    "currentVersion" INTEGER,
    "linkNonce" TEXT,
    "tokenHash" TEXT,
    "linkCreatedById" TEXT,
    "linkCreatedAt" TIMESTAMP(3),
    "linkExpiresAt" TIMESTAMP(3),
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "lastVisitAt" TIMESTAMP(3),
    "createdById" TEXT,
    "purgeAfter" TIMESTAMP(3) NOT NULL,
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedSiteVersion" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "instruction" TEXT,
    "runId" TEXT,
    "html" TEXT,
    "desktop" BYTEA,
    "mobile" BYTEA,
    "thumb" BYTEA,
    "checks" JSONB NOT NULL,
    "scores" JSONB,
    "probeHash" TEXT,
    "probeExpiresAt" TIMESTAMP(3),
    "model" TEXT,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedSiteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedSiteAsset" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sourceUrl" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedSiteAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedSiteVisit" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedSiteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedSite_tokenHash_key" ON "GeneratedSite"("tokenHash");

-- CreateIndex
CREATE INDEX "GeneratedSite_workspaceId_createdAt_idx" ON "GeneratedSite"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedSite_leadId_createdAt_idx" ON "GeneratedSite"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedSite_purgeAfter_idx" ON "GeneratedSite"("purgeAfter");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedSiteVersion_runId_key" ON "GeneratedSiteVersion"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedSiteVersion_probeHash_key" ON "GeneratedSiteVersion"("probeHash");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedSiteVersion_siteId_number_key" ON "GeneratedSiteVersion"("siteId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedSiteAsset_siteId_name_key" ON "GeneratedSiteAsset"("siteId", "name");

-- CreateIndex
CREATE INDEX "GeneratedSiteVisit_siteId_createdAt_idx" ON "GeneratedSiteVisit"("siteId", "createdAt");

-- AddForeignKey
ALTER TABLE "GeneratedSite" ADD CONSTRAINT "GeneratedSite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedSite" ADD CONSTRAINT "GeneratedSite_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedSite" ADD CONSTRAINT "GeneratedSite_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "ProspectAudit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedSiteVersion" ADD CONSTRAINT "GeneratedSiteVersion_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "GeneratedSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedSiteVersion" ADD CONSTRAINT "GeneratedSiteVersion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedSiteAsset" ADD CONSTRAINT "GeneratedSiteAsset_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "GeneratedSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedSiteVisit" ADD CONSTRAINT "GeneratedSiteVisit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "GeneratedSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Business rules the application also checks.
ALTER TABLE "GeneratedSite" ADD CONSTRAINT "GeneratedSite_link_check" CHECK (("linkNonce" IS NULL) = ("tokenHash" IS NULL) AND ("tokenHash" IS NULL OR "linkExpiresAt" IS NOT NULL));
ALTER TABLE "GeneratedSite" ADD CONSTRAINT "GeneratedSite_version_check" CHECK ("currentVersion" IS NULL OR "currentVersion" >= 1);
ALTER TABLE "GeneratedSite" ADD CONSTRAINT "GeneratedSite_visits_check" CHECK ("visitCount" >= 0);
ALTER TABLE "GeneratedSiteVersion" ADD CONSTRAINT "GeneratedSiteVersion_number_check" CHECK ("number" >= 1);
ALTER TABLE "GeneratedSiteVersion" ADD CONSTRAINT "GeneratedSiteVersion_cost_check" CHECK ("costMicros" >= 0);
ALTER TABLE "GeneratedSiteVersion" ADD CONSTRAINT "GeneratedSiteVersion_probe_check" CHECK (("probeHash" IS NULL) = ("probeExpiresAt" IS NULL));
ALTER TABLE "GeneratedSiteAsset" ADD CONSTRAINT "GeneratedSiteAsset_name_check" CHECK ("name" ~ '^[a-z0-9][a-z0-9-]{0,39}$');
ALTER TABLE "GeneratedSiteAsset" ADD CONSTRAINT "GeneratedSiteAsset_kind_check" CHECK ("kind" IN ('logo', 'image', 'font'));
