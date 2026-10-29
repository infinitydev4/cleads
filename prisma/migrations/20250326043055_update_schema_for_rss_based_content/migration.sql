/*
  Warnings:

  - You are about to drop the column `newsCategory` on the `ArticleSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `newsApiKey` on the `Settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ArticleSchedule" DROP COLUMN "newsCategory",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "contentSource" TEXT NOT NULL DEFAULT 'rss',
ADD COLUMN     "highQualityGeneration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rssArticleSelectionMode" TEXT NOT NULL DEFAULT 'recent',
ADD COLUMN     "rssSourceCount" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "newsApiKey",
ADD COLUMN     "allowRsslessGeneration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "defaultRssCategory" TEXT NOT NULL DEFAULT 'technology',
ADD COLUMN     "highQualityGeneration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rssArticleSelectionMode" TEXT NOT NULL DEFAULT 'recent',
ADD COLUMN     "rssSourceCount" INTEGER NOT NULL DEFAULT 3;
