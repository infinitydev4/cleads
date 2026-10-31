/** Empties every table the integration suites touch, children first, so suites cannot trip over each other's rows. Disposable databases only. */
export async function resetDatabase(prisma: { $executeRawUnsafe: (sql: string) => Promise<unknown> }) {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "EmailMessage","EmailTemplate","Mailbox","Meeting","Activity","Task","Deal","Lead","Contact","Company","ImportBatch","Suppression","SavedView","AvailabilityRule","AvailabilityException","BookingProfile","RateLimitHit","MailSetting","AuditLog","Invitation","Appointment","Availability","BreakTime","Exception","User" CASCADE`
  )
}
