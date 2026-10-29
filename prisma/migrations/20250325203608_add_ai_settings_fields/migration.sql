-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "huggingFaceModel" TEXT,
ADD COLUMN     "huggingFaceTextModel" TEXT,
ADD COLUMN     "replicateApiKey" TEXT,
ADD COLUMN     "replicateModel" TEXT,
ADD COLUMN     "textProvider" TEXT NOT NULL DEFAULT 'openai';
