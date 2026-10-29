import type { AppointmentStatus, AppointmentType, MeetingStatus, MeetingType, PrismaClient } from "@prisma/client"
import { legacyWallClockToInstant, parseMinutes, subtractBreak } from "./time"

/**
 * One-off, repeatable copy of the old back-office data into the CRM model.
 * Nothing is deleted or modified in the old tables: the old screens keep working until the meetings epic (E8).
 * Re-running creates only what is missing. With `apply: false` everything runs in a transaction that is rolled back.
 */
export interface BackfillOptions {
  apply: boolean
  /** Host of the migrated meetings and rules. Default: the oldest active owner (the old back-office had a single admin). */
  hostEmail?: string
  /** Time zone the old dates were typed in. */
  legacyTimezone?: string
  /** Length given to meetings: the old slots were 30 minutes. */
  meetingMinutes?: number
}

export interface BackfillReport {
  applied: boolean
  host: { id: string; email: string | null }
  timezone: string
  before: { clients: number; appointments: number; futureAppointments: number; availabilities: number; exceptions: number }
  created: { contacts: number; leads: number; meetings: number; availabilityRules: number; availabilityExceptions: number }
  alreadyThere: { contacts: number; meetings: number }
  warnings: string[]
  checks: { name: string; ok: boolean; detail: string }[]
  ok: boolean
}

class DryRunDone extends Error {
  constructor(public report: BackfillReport) {
    super("dry run")
  }
}

const STATUS: Record<AppointmentStatus, MeetingStatus> = {
  PENDING: "SCHEDULED",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELED",
  COMPLETED: "COMPLETED",
}
const typeOf = (t: AppointmentType): MeetingType => (t === "SUIVI" ? "FOLLOW_UP" : "DISCOVERY")

export async function runBackfill(prisma: PrismaClient, options: BackfillOptions): Promise<BackfillReport> {
  const timezone = options.legacyTimezone ?? "Europe/Paris"
  const minutes = options.meetingMinutes ?? 30
  try {
    const report = await prisma.$transaction(
      async (tx) => {
        const warnings: string[] = []
        const host = await tx.user.findFirst({
          where: options.hostEmail
            ? { email: { equals: options.hostEmail, mode: "insensitive" }, workspaceId: { not: null }, active: true }
            : { role: "OWNER", workspaceId: { not: null }, active: true },
          orderBy: { createdAt: "asc" },
        })
        if (!host?.workspaceId) throw new Error("Aucun propriétaire actif avec un espace de travail : appliquez les migrations E2/E3, puis réessayez.")
        const workspaceId = host.workspaceId

        const clients = await tx.user.findMany({ where: { role: "USER" }, orderBy: { createdAt: "asc" } })
        const appointments = await tx.appointment.findMany({ orderBy: { date: "asc" } })
        const availabilities = await tx.availability.findMany()
        const breaks = await tx.breakTime.findMany()
        const exceptions = await tx.exception.findMany()
        const now = new Date()

        const created = { contacts: 0, leads: 0, meetings: 0, availabilityRules: 0, availabilityExceptions: 0 }
        const alreadyThere = { contacts: 0, meetings: 0 }
        const note = "Repris de l’ancien back-office"

        /** Finds or creates the contact (and its lead) for an email; the email is the identity in the old system. */
        async function ensureContact(input: { email: string; name?: string | null; phone?: string | null; legacyUserId?: string; createdAt: Date }) {
          const email = input.email.trim().toLowerCase()
          let contact =
            (input.legacyUserId ? await tx.contact.findUnique({ where: { legacyUserId: input.legacyUserId } }) : null) ??
            (await tx.contact.findUnique({ where: { workspaceId_email: { workspaceId, email } } }))
          if (contact) {
            alreadyThere.contacts++
          } else {
            contact = await tx.contact.create({
              data: {
                workspaceId,
                email,
                name: input.name || null,
                phone: input.phone || null,
                source: "LEGACY",
                collectedFrom: "Ancien back-office (demande de rendez-vous du prospect)",
                collectedAt: input.createdAt,
                legalBasis: "pre_contractual_request",
                legacyUserId: input.legacyUserId,
                createdAt: input.createdAt,
              },
            })
            created.contacts++
          }
          let lead = await tx.lead.findFirst({ where: { workspaceId, contactId: contact.id } })
          if (!lead) {
            lead = await tx.lead.create({
              data: { workspaceId, contactId: contact.id, source: "LEGACY", status: "NEW", createdAt: input.createdAt },
            })
            await tx.activity.create({
              data: { workspaceId, leadId: lead.id, kind: "SYSTEM", actorKind: "SYSTEM", body: note, occurredAt: input.createdAt },
            })
            created.leads++
          }
          return { contact, lead }
        }

        // 1. Former clients (role USER) become contacts with an unassigned lead.
        const seenEmails = new Map<string, string>()
        for (const client of clients) {
          if (!client.email) {
            warnings.push(`Client ${client.id} sans email : ignoré.`)
            continue
          }
          const key = client.email.trim().toLowerCase()
          if (seenEmails.has(key)) {
            warnings.push(`Comptes ${seenEmails.get(key)} et ${client.id} partagent l’adresse ${key} à la casse près : un seul contact créé.`)
            continue
          }
          seenEmails.set(key, client.id)
          await ensureContact({ email: client.email, name: client.name, phone: client.phone, legacyUserId: client.id, createdAt: client.createdAt })
        }

        // 2. Appointments become meetings of the host, linked to the lead of the person who booked.
        for (const appt of appointments) {
          const existing = await tx.meeting.findUnique({ where: { legacyAppointmentId: appt.id }, select: { id: true } })
          if (existing) {
            alreadyThere.meetings++
            continue
          }
          const { contact, lead } = await ensureContact({ email: appt.email, name: appt.clientName, phone: appt.phone, createdAt: appt.createdAt })
          const startsAt = legacyWallClockToInstant(appt.date, timezone)
          await tx.meeting.create({
            data: {
              workspaceId,
              hostId: host.id,
              leadId: lead.id,
              contactId: contact.id,
              startsAt,
              endsAt: new Date(startsAt.getTime() + minutes * 60000),
              timezone,
              type: typeOf(appt.type),
              status: STATUS[appt.status],
              notes: [appt.type !== "CONSULTATION" ? `[Ancien type : ${appt.type}]` : null, appt.notes].filter(Boolean).join(" ") || null,
              source: "legacy",
              legacyAppointmentId: appt.id,
              createdAt: appt.createdAt,
            },
          })
          created.meetings++
        }

        // 3. Weekly availability: one row per interval, the break splitting the day. Skipped when the host already has rules.
        const alreadyHasRules = (await tx.availabilityRule.count({ where: { hostId: host.id } })) > 0
        if (!alreadyHasRules) {
          for (const a of availabilities) {
            if (a.userId !== host.id) {
              warnings.push(`Disponibilité du jour ${a.dayOfWeek} appartenant à un autre compte (${a.userId}) : ignorée.`)
              continue
            }
            const start = parseMinutes(a.startTime)
            const end = parseMinutes(a.endTime)
            if (start === null || end === null || end <= start) {
              warnings.push(`Disponibilité invalide (jour ${a.dayOfWeek}, ${a.startTime}-${a.endTime}) : ignorée.`)
              continue
            }
            const brk = breaks.find((b) => b.userId === a.userId && b.isActive)
            const breakInterval = brk && parseMinutes(brk.startTime) !== null && parseMinutes(brk.endTime) !== null ? { start: parseMinutes(brk.startTime)!, end: parseMinutes(brk.endTime)! } : null
            for (const interval of subtractBreak({ start, end }, breakInterval)) {
              await tx.availabilityRule.create({
                data: { workspaceId, hostId: host.id, weekday: a.dayOfWeek, startMinute: interval.start, endMinute: interval.end, timezone, active: a.isActive },
              })
              created.availabilityRules++
            }
          }
        }

        // 4. Days off and one-off openings. The date digits are wall clock, like appointments.
        for (const e of exceptions) {
          if (e.userId !== host.id) continue
          const day = new Date(Date.UTC(e.date.getUTCFullYear(), e.date.getUTCMonth(), e.date.getUTCDate()))
          const result = await tx.availabilityException.createMany({
            data: [{ workspaceId, hostId: host.id, date: day, available: e.isAvailable, reason: e.reason }],
            skipDuplicates: true,
          })
          created.availabilityExceptions += result.count
        }

        // Verification: what was in the old tables is in the new ones.
        const legacyMeetings = await tx.meeting.count({ where: { workspaceId, legacyAppointmentId: { not: null } } })
        const futureAppointments = appointments.filter((a) => legacyWallClockToInstant(a.date, timezone) > now && a.status !== "CANCELLED").length
        const futureMeetings = await tx.meeting.count({
          where: { workspaceId, legacyAppointmentId: { not: null }, startsAt: { gt: now }, status: { not: "CANCELED" } },
        })
        const legacyContacts = await tx.contact.count({ where: { workspaceId, source: "LEGACY" } })
        const emails = new Set([...clients.map((c) => c.email?.trim().toLowerCase()), ...appointments.map((a) => a.email.trim().toLowerCase())].filter(Boolean))
        const checks = [
          { name: "Tous les rendez-vous sont repris", ok: legacyMeetings === appointments.length, detail: `${legacyMeetings} / ${appointments.length}` },
          { name: "Aucun rendez-vous futur perdu", ok: futureMeetings === futureAppointments, detail: `${futureMeetings} / ${futureAppointments}` },
          { name: "Une personne par adresse email", ok: legacyContacts >= emails.size, detail: `${legacyContacts} contacts pour ${emails.size} adresses` },
          { name: "Aucune fiche sans rendez-vous ni contact", ok: (await tx.lead.count({ where: { workspaceId, companyId: null, contactId: null } })) === 0, detail: "contrôle de cohérence" },
        ]

        const report: BackfillReport = {
          applied: options.apply,
          host: { id: host.id, email: host.email },
          timezone,
          before: {
            clients: clients.length,
            appointments: appointments.length,
            futureAppointments,
            availabilities: availabilities.length,
            exceptions: exceptions.length,
          },
          created,
          alreadyThere,
          warnings,
          checks,
          ok: checks.every((c) => c.ok),
        }
        if (!options.apply || !report.ok) throw new DryRunDone(report)
        return report
      },
      { timeout: 120_000, maxWait: 10_000 }
    )
    return report
  } catch (error) {
    if (error instanceof DryRunDone) return error.report
    throw error
  }
}
