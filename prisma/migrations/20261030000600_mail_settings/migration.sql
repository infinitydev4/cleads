-- E8b: which provider carries transactional email. Additive; no data touched.
CREATE TABLE "MailSetting" (
    "workspaceId" TEXT NOT NULL,
    "transactionalProvider" TEXT NOT NULL DEFAULT 'ses',
    "fallbackEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MailSetting_pkey" PRIMARY KEY ("workspaceId"),
    CONSTRAINT "MailSetting_provider_check" CHECK ("transactionalProvider" IN ('ses', 'resend'))
);
ALTER TABLE "MailSetting" ADD CONSTRAINT "MailSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
