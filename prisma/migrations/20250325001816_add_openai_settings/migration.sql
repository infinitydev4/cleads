-- AlterTable
ALTER TABLE "Article" ALTER COLUMN "themeId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "NotificationSettings" ADD COLUMN     "openaiApiKey" TEXT,
ADD COLUMN     "openaiModel" TEXT NOT NULL DEFAULT 'GPT35';

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openaiApiKey" TEXT,
    "openaiModel" TEXT NOT NULL DEFAULT 'GPT35',
    "autoGenerateTags" BOOLEAN NOT NULL DEFAULT false,
    "autoOptimizeSEO" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Settings_userId_key" ON "Settings"("userId");

-- CreateIndex
CREATE INDEX "Settings_userId_idx" ON "Settings"("userId");

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
