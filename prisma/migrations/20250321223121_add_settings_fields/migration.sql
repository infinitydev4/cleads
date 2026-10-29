-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "bic" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "postalCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "language" TEXT DEFAULT 'fr';
