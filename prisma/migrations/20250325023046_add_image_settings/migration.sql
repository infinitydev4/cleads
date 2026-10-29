-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "huggingFaceApiKey" TEXT,
ADD COLUMN     "imageProvider" TEXT NOT NULL DEFAULT 'picsum',
ADD COLUMN     "pexelsApiKey" TEXT,
ADD COLUMN     "stableDiffusionApiKey" TEXT;
