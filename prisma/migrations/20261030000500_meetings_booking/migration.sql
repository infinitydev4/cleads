-- E8: meetings. Additive only: no existing row is rewritten.
ALTER TABLE "Meeting"
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "rescheduledToId" TEXT,
  ADD COLUMN "reminderSentAt" TIMESTAMP(3),
  ADD COLUMN "hostReminderSentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Meeting_rescheduledToId_key" ON "Meeting"("rescheduledToId");
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_rescheduledToId_fkey" FOREIGN KEY ("rescheduledToId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Index used by the reminder job and the agenda.
CREATE INDEX "Meeting_status_startsAt_idx" ON "Meeting"("status", "startsAt");

CREATE TABLE "BookingProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "bufferMin" INTEGER NOT NULL DEFAULT 10,
    "minNoticeMin" INTEGER NOT NULL DEFAULT 120,
    "horizonDays" INTEGER NOT NULL DEFAULT 21,
    "videoUrl" TEXT,
    "intro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookingProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BookingProfile_duration_check" CHECK ("durationMin" BETWEEN 10 AND 240),
    CONSTRAINT "BookingProfile_buffer_check" CHECK ("bufferMin" BETWEEN 0 AND 120),
    CONSTRAINT "BookingProfile_notice_check" CHECK ("minNoticeMin" BETWEEN 0 AND 20160),
    CONSTRAINT "BookingProfile_horizon_check" CHECK ("horizonDays" BETWEEN 1 AND 120),
    CONSTRAINT "BookingProfile_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX "BookingProfile_hostId_key" ON "BookingProfile"("hostId");
CREATE UNIQUE INDEX "BookingProfile_slug_key" ON "BookingProfile"("slug");
ALTER TABLE "BookingProfile" ADD CONSTRAINT "BookingProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingProfile" ADD CONSTRAINT "BookingProfile_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RateLimitHit_key_createdAt_idx" ON "RateLimitHit"("key", "createdAt");

