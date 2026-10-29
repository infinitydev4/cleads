// Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://... npx vitest run tests/backfill.integration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PrismaClient } from "@prisma/client"
import { runBackfill } from "../features/legacy/backfill"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("legacy backfill (database)", () => {
  let prisma: PrismaClient
  let hostId: string

  beforeAll(() => {
    prisma = new PrismaClient({ datasources: { db: { url } } })
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    for (const table of ["Meeting", "Activity", "Task", "Deal", "Lead", "Contact", "Company", "AvailabilityRule", "AvailabilityException", "Appointment", "Availability", "BreakTime", "Exception", "AuditLog", "Invitation", "User"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)
    }
    const host = await prisma.user.create({ data: { email: "admin@legacy.test", name: "Admin", role: "OWNER", workspaceId: "ws_default" } })
    hostId = host.id
    const marie = await prisma.user.create({ data: { email: "marie@legacy.test", name: "Marie Test", phone: "0199000001", role: "USER" } })
    await prisma.user.create({ data: { email: "Pierre@Legacy.test", name: "Pierre A", role: "USER" } })
    await prisma.user.create({ data: { email: "pierre@legacy.test", name: "Pierre B", role: "USER" } })
    await prisma.user.create({ data: { name: "Sans email", role: "USER" } })

    const appt = (o: Partial<Parameters<typeof prisma.appointment.create>[0]["data"]> & { date: Date; email: string }) =>
      prisma.appointment.create({ data: { clientName: "Client", phone: "0199000002", type: "CONSULTATION", status: "CONFIRMED", userId: marie.id, ...o } as never })
    await appt({ date: new Date("2030-01-14T14:00:00Z"), email: "marie@legacy.test", clientName: "Marie Test" }) // winter, future
    await appt({ date: new Date("2030-07-14T14:00:00Z"), email: "marie@legacy.test", status: "PENDING", type: "SUIVI" }) // summer, future
    await appt({ date: new Date("2020-03-02T10:00:00Z"), email: "marie@legacy.test", status: "COMPLETED", notes: "Premier échange", type: "LANDING_PAGE" })
    await appt({ date: new Date("2030-02-01T09:00:00Z"), email: "marie@legacy.test", status: "CANCELLED" }) // future but cancelled
    await appt({ date: new Date("2030-03-04T15:30:00Z"), email: "Invite@Legacy.test", clientName: "Invité sans compte" })

    // Monday 09:00-18:00 with a 12:00-14:00 break, Sunday off, one broken row.
    await prisma.availability.create({ data: { userId: hostId, dayOfWeek: 1, startTime: "09:00", endTime: "18:00", isActive: true } })
    await prisma.availability.createMany({ data: [{ userId: hostId, dayOfWeek: 0, startTime: "10:00", endTime: "12:00", isActive: false }] }).catch(() => null)
    await prisma.breakTime.create({ data: { userId: hostId, startTime: "12:00", endTime: "14:00", isActive: true } })
    await prisma.exception.create({ data: { userId: hostId, date: new Date("2030-12-25T00:00:00Z"), isAvailable: false, reason: "Noël" } })
  })

  it("simulates without writing anything", async () => {
    const report = await runBackfill(prisma, { apply: false })
    expect(report.applied).toBe(false)
    expect(report.created.meetings).toBe(5)
    expect(report.ok).toBe(true)
    expect(await prisma.meeting.count()).toBe(0)
    expect(await prisma.contact.count()).toBe(0)
  })

  it("copies clients, appointments and availability, and the checks pass", async () => {
    const report = await runBackfill(prisma, { apply: true })
    expect(report.ok, JSON.stringify(report.checks)).toBe(true)
    expect(report.before).toMatchObject({ clients: 4, appointments: 5, futureAppointments: 3 })
    expect(report.created).toMatchObject({ meetings: 5, availabilityRules: 3, availabilityExceptions: 1 })

    // 3 distinct addresses among clients (Pierre twice, one without email) plus the guest booking.
    expect(await prisma.contact.count({ where: { source: "LEGACY" } })).toBe(3)
    expect(report.warnings.some((w) => w.includes("à la casse près"))).toBe(true)
    expect(report.warnings.some((w) => w.includes("sans email"))).toBe(true)

    const meetings = await prisma.meeting.findMany({ orderBy: { startsAt: "asc" }, include: { contact: true, lead: true } })
    expect(meetings.map((m) => m.startsAt.toISOString())).toEqual([
      "2020-03-02T09:00:00.000Z", // 10:00 Paris, winter
      "2030-01-14T13:00:00.000Z",
      "2030-02-01T08:00:00.000Z",
      "2030-03-04T14:30:00.000Z",
      "2030-07-14T12:00:00.000Z", // 14:00 Paris, summer
    ])
    expect(meetings.every((m) => m.endsAt.getTime() - m.startsAt.getTime() === 30 * 60000)).toBe(true)
    expect(meetings.every((m) => m.hostId === hostId && m.source === "legacy" && m.lead && m.contact)).toBe(true)
    const byStatus = Object.fromEntries(meetings.map((m) => [m.startsAt.toISOString(), m.status]))
    expect(byStatus["2020-03-02T09:00:00.000Z"]).toBe("COMPLETED")
    expect(byStatus["2030-02-01T08:00:00.000Z"]).toBe("CANCELED")
    expect(byStatus["2030-07-14T12:00:00.000Z"]).toBe("SCHEDULED")
    expect(meetings.find((m) => m.type === "FOLLOW_UP")).toBeTruthy()
    expect(meetings.find((m) => m.notes?.includes("[Ancien type : LANDING_PAGE]"))?.notes).toContain("Premier échange")

    // Contacts are stored lower-case, with their origin recorded.
    const guest = await prisma.contact.findUniqueOrThrow({ where: { workspaceId_email: { workspaceId: "ws_default", email: "invite@legacy.test" } } })
    expect(guest).toMatchObject({ name: "Invité sans compte", source: "LEGACY", legalBasis: "pre_contractual_request" })

    // Monday is split around the break; the inactive Sunday row is copied and stays inactive.
    const rules = await prisma.availabilityRule.findMany({ orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] })
    expect(rules.map((r) => [r.weekday, r.startMinute, r.endMinute, r.active])).toEqual([[0, 600, 720, false], [1, 540, 720, true], [1, 840, 1080, true]])
    expect((await prisma.availabilityException.findFirstOrThrow()).reason).toBe("Noël")

    // The old tables are untouched.
    expect(await prisma.appointment.count()).toBe(5)
    expect(await prisma.user.count({ where: { role: "USER" } })).toBe(4)
  })

  it("can run again without duplicating anything", async () => {
    await runBackfill(prisma, { apply: true })
    const counts = async () => [await prisma.contact.count(), await prisma.lead.count(), await prisma.meeting.count(), await prisma.availabilityRule.count(), await prisma.availabilityException.count(), await prisma.activity.count()]
    const first = await counts()
    const second = await runBackfill(prisma, { apply: true })
    expect(await counts()).toEqual(first)
    expect(second.created).toEqual({ contacts: 0, leads: 0, meetings: 0, availabilityRules: 0, availabilityExceptions: 0 })
    expect(second.ok).toBe(true)
  })

  it("keeps what a person edited since the first run", async () => {
    await runBackfill(prisma, { apply: true })
    const meeting = await prisma.meeting.findFirstOrThrow({ where: { type: "FOLLOW_UP" } })
    await prisma.meeting.update({ where: { id: meeting.id }, data: { status: "NO_SHOW", outcome: "LOST" } })
    await runBackfill(prisma, { apply: true })
    expect(await prisma.meeting.findUniqueOrThrow({ where: { id: meeting.id } })).toMatchObject({ status: "NO_SHOW", outcome: "LOST" })
  })

  it("refuses to run without an active owner", async () => {
    await prisma.user.update({ where: { id: hostId }, data: { active: false } })
    await expect(runBackfill(prisma, { apply: true })).rejects.toThrow(/propriétaire/)
  })
})

suite("data model rules (database)", () => {
  let prisma: PrismaClient
  beforeAll(() => {
    prisma = new PrismaClient({ datasources: { db: { url } } })
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    for (const table of ["Meeting", "Activity", "Lead", "Contact", "Company", "Suppression", "AvailabilityRule"]) await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)
    await prisma.user.deleteMany({ where: { email: "host@rules.test" } })
  })
  const ws = "ws_default"

  it("deduplicates companies by external id and contacts by email", async () => {
    await prisma.company.create({ data: { workspaceId: ws, name: "A", externalId: "gm:1" } })
    await expect(prisma.company.create({ data: { workspaceId: ws, name: "A bis", externalId: "gm:1" } })).rejects.toThrow()
    await prisma.company.createMany({ data: [{ workspaceId: ws, name: "Sans id 1" }, { workspaceId: ws, name: "Sans id 2" }] }) // NULL external ids never collide
    await prisma.contact.create({ data: { workspaceId: ws, email: "a@b.fr" } })
    await expect(prisma.contact.create({ data: { workspaceId: ws, email: "a@b.fr" } })).rejects.toThrow()
  })

  it("refuses values that break the rules the application relies on", async () => {
    await expect(prisma.contact.create({ data: { workspaceId: ws, email: "Upper@Case.fr" } })).rejects.toThrow(/lowercase/)
    await expect(prisma.company.create({ data: { workspaceId: ws, name: "X", domain: "Example.COM" } })).rejects.toThrow(/lowercase/)
    await expect(prisma.lead.create({ data: { workspaceId: ws } })).rejects.toThrow(/company_or_contact/)
    const c = await prisma.contact.create({ data: { workspaceId: ws, email: "ok@ok.fr" } })
    await expect(prisma.lead.create({ data: { workspaceId: ws, contactId: c.id, score: 101 } })).rejects.toThrow(/score_range/)
    await expect(prisma.suppression.create({ data: { workspaceId: ws, reason: "MANUAL" } })).rejects.toThrow(/xor_domain/)
    await expect(prisma.suppression.create({ data: { workspaceId: ws, reason: "MANUAL", email: "a@b.fr", domain: "b.fr" } })).rejects.toThrow(/xor_domain/)
  })

  it("keeps meetings and availability coherent", async () => {
    const host = await prisma.user.create({ data: { email: "host@rules.test", role: "CLOSER", workspaceId: ws } })
    const t = new Date("2030-01-01T10:00:00Z")
    await expect(prisma.meeting.create({ data: { workspaceId: ws, hostId: host.id, startsAt: t, endsAt: t } })).rejects.toThrow(/ends_after_start/)
    await expect(prisma.availabilityRule.create({ data: { workspaceId: ws, hostId: host.id, weekday: 7, startMinute: 0, endMinute: 60 } })).rejects.toThrow(/interval/)
    await expect(prisma.availabilityRule.create({ data: { workspaceId: ws, hostId: host.id, weekday: 1, startMinute: 600, endMinute: 540 } })).rejects.toThrow(/interval/)
  })

  it("a company holds a single lead", async () => {
    const company = await prisma.company.create({ data: { workspaceId: ws, name: "Une seule fiche" } })
    await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id } })
    await expect(prisma.lead.create({ data: { workspaceId: ws, companyId: company.id } })).rejects.toThrow()
  })

  it("refuses to delete a company that still has a lead", async () => {
    const company = await prisma.company.create({ data: { workspaceId: ws, name: "Protégée" } })
    await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id } })
    await expect(prisma.company.delete({ where: { id: company.id } })).rejects.toThrow()
  })
})
