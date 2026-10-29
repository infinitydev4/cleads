-- AlterTable
ALTER TABLE "ArticleSchedule" ADD COLUMN     "generateImage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "imageModel" TEXT,
ADD COLUMN     "imageProvider" TEXT;
