-- Daily call goal of the closers, set by owners and managers (« Mes closers »). Additive, defaults to the former 40.

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "dailyCallGoal" INTEGER NOT NULL DEFAULT 40;
