-- E9b: replies and bounces read from the mailboxes. Additive; no existing row is touched.
-- AlterEnum
ALTER TYPE "EmailStatus" ADD VALUE 'RECEIVED';

-- CreateEnum
CREATE TYPE "ReplyClass" AS ENUM ('INTERESTED', 'NOT_NOW', 'NOT_INTERESTED', 'OUT_OF_OFFICE', 'WRONG_PERSON', 'STOP', 'OTHER');

-- AlterTable
ALTER TABLE "Mailbox" ADD COLUMN "imapLastUid" INTEGER,
ADD COLUMN "imapUidValidity" TEXT,
ADD COLUMN "lastPolledAt" TIMESTAMP(3),
ADD COLUMN "lastPollError" TEXT,
ADD COLUMN "pollClaimedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN "replyClass" "ReplyClass",
ADD COLUMN "readAt" TIMESTAMP(3),
ADD COLUMN "repliesToId" TEXT;

-- CreateIndex
CREATE INDEX "EmailMessage_workspaceId_direction_createdAt_idx" ON "EmailMessage"("workspaceId", "direction", "createdAt");
