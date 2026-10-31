-- E9a: prospecting mailboxes, templates and the email log. Additive; no existing row is touched.
-- CreateEnum
CREATE TYPE "MailboxProvider" AS ENUM ('SMTP');

-- CreateEnum
CREATE TYPE "MailboxStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENDING', 'SENT', 'FAILED', 'BOUNCED');

-- CreateTable
CREATE TABLE "Mailbox" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerId" TEXT,
    "address" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "provider" "MailboxProvider" NOT NULL DEFAULT 'SMTP',
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "sentFolder" TEXT,
    "dailyCap" INTEGER NOT NULL DEFAULT 30,
    "warmupStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MailboxStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusReason" TEXT,
    "signature" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "leadId" TEXT,
    "contactId" TEXT,
    "sentById" TEXT,
    "templateId" TEXT,
    "direction" "EmailDirection" NOT NULL DEFAULT 'OUTBOUND',
    "status" "EmailStatus" NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "inReplyTo" TEXT,
    "error" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mailbox_workspaceId_ownerId_idx" ON "Mailbox"("workspaceId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Mailbox_workspaceId_address_key" ON "Mailbox"("workspaceId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_workspaceId_name_key" ON "EmailTemplate"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_messageId_key" ON "EmailMessage"("messageId");

-- CreateIndex
CREATE INDEX "EmailMessage_mailboxId_createdAt_idx" ON "EmailMessage"("mailboxId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_leadId_createdAt_idx" ON "EmailMessage"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_workspaceId_createdAt_idx" ON "EmailMessage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_workspaceId_toEmail_idx" ON "EmailMessage"("workspaceId", "toEmail");

-- AddForeignKey
ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Rules the application relies on, enforced by the database too.
ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_address_lower_check" CHECK ("address" = lower("address"));
ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_daily_cap_check" CHECK ("dailyCap" BETWEEN 1 AND 50);
ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_ports_check" CHECK ("smtpPort" BETWEEN 1 AND 65535 AND ("imapPort" IS NULL OR "imapPort" BETWEEN 1 AND 65535));
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_to_lower_check" CHECK ("toEmail" = lower("toEmail"));
