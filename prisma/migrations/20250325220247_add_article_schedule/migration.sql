-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "newsApiKey" TEXT;

-- CreateTable
CREATE TABLE "ArticleSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "frequency" "ScheduleFrequency" NOT NULL DEFAULT 'WEEKLY',
    "status" "ScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "categories" TEXT[],
    "keywords" TEXT[],
    "textProvider" TEXT,
    "openaiModel" TEXT,
    "huggingFaceModel" TEXT,
    "newsCategory" TEXT,
    "newsQuery" TEXT,
    "nextRunDate" TIMESTAMP(3) NOT NULL,
    "lastRunDate" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'professionnel',
    "language" TEXT NOT NULL DEFAULT 'français',
    "publishImmediately" BOOLEAN NOT NULL DEFAULT false,
    "maxArticlesPerMonth" INTEGER NOT NULL DEFAULT 4,
    "articlesGenerated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticleSchedule_userId_idx" ON "ArticleSchedule"("userId");

-- CreateIndex
CREATE INDEX "ArticleSchedule_nextRunDate_idx" ON "ArticleSchedule"("nextRunDate");

-- CreateIndex
CREATE INDEX "ArticleSchedule_status_idx" ON "ArticleSchedule"("status");

-- AddForeignKey
ALTER TABLE "ArticleSchedule" ADD CONSTRAINT "ArticleSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
