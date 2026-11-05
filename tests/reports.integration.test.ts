// Needs a disposable PostgreSQL with the migrations applied (never your development database).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { monthPeriod } from "@/features/metrics/periods"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("reports (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let report: typeof import("@/features/metrics/report")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  const october = monthPeriod("2026-10") // over: the figures no longer move
  const at = (day: string) => new Date(`2026-10-${day}T10:00:00Z`)
  let n = 0

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    report = await import("@/features/metrics/report")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  const lead = async (name: string, ownerId: string | null) => {
    const c = await prisma.company.create({ data: { workspaceId: ws, name } })
    return prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, ownerId, createdAt: at("02") } })
  }
  const email = (mailboxId: string, leadId: string, direction: "OUTBOUND" | "INBOUND", createdAt: Date, extra: object = {}) =>
    prisma.emailMessage.create({ data: { workspaceId: ws, mailboxId, leadId, direction, status: direction === "OUTBOUND" ? "SENT" : "RECEIVED", fromEmail: "a@x.test", toEmail: "b@x.test", subject: "s", bodyText: "b", messageId: `<r${++n}@test>`, createdAt, ...extra } })
  const deal = (leadId: string, createdById: string, ownerId: string, extra: object) => prisma.deal.create({ data: { workspaceId: ws, leadId, createdById, ownerId, createdAt: at("05"), ...extra } })
  const meeting = (leadId: string, createdById: string, hostId: string, status: "COMPLETED" | "CANCELED" | "NO_SHOW") =>
    prisma.meeting.create({ data: { workspaceId: ws, leadId, createdById, hostId, startsAt: at("12"), endsAt: new Date(at("12").getTime() + 1800_000), status, timezone: "Europe/Paris", createdAt: at("06") } })

  beforeEach(async () => {
    await resetDatabase(prisma)
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["sdr2", "SDR"], ["closer", "CLOSER"], ["closer2", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@reports.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
    const box = await prisma.mailbox.create({ data: { workspaceId: ws, ownerId: u.sdr.id, address: "sdr@send.example.test", displayName: "SDR", smtpHost: "smtp.example.test", smtpPort: 465, username: "sdr", secret: "v1.x.x.x" } })
    const [l1, l2, l3, l4, l5] = [await lead("Alpha", u.sdr.id), await lead("Bravo", u.sdr.id), await lead("Charlie", u.sdr2.id), await lead("Delta", u.sdr.id), await lead("=HYPERLINK(\"x\")", u.sdr2.id)]

    // SDR: two fiches emailed (Alpha twice), one test email and one in September that do not count, a call on Alpha.
    await email(box.id, l1.id, "OUTBOUND", at("03"))
    await email(box.id, l1.id, "OUTBOUND", at("04"))
    await email(box.id, l2.id, "OUTBOUND", at("03"))
    await email(box.id, l4.id, "OUTBOUND", at("03"), { isTest: true })
    await email(box.id, l3.id, "OUTBOUND", new Date("2026-09-20T10:00:00Z"))
    await prisma.activity.create({ data: { workspaceId: ws, leadId: l1.id, actorId: u.sdr.id, kind: "CALL", occurredAt: at("04") } })
    // A person's answer counts, an out-of-office does not.
    await email(box.id, l1.id, "INBOUND", at("08"))
    await email(box.id, l2.id, "INBOUND", at("08"), { replyClass: "OUT_OF_OFFICE" })
    // SDR 2 calls Charlie.
    await prisma.activity.create({ data: { workspaceId: ws, leadId: l3.id, actorId: u.sdr2.id, kind: "CALL", occurredAt: at("04") } })

    // Opportunities: the closer wins Alpha (EUR) and loses Bravo; closer 2 wins Charlie without an amount (before the
    // rule) and the formula-like name in dollars; Delta was won in September.
    await deal(l1.id, u.sdr.id, u.closer.id, { stage: "WON", wonAt: at("20"), amountCents: 450000 })
    await deal(l2.id, u.sdr.id, u.closer.id, { stage: "LOST", lostAt: at("21"), lostReason: "Budget insuffisant" })
    await deal(l3.id, u.sdr2.id, u.closer2.id, { stage: "WON", wonAt: at("22") })
    await deal(l5.id, u.sdr2.id, u.closer2.id, { stage: "WON", wonAt: at("23"), amountCents: 120000, currency: "USD" })
    await deal(l4.id, u.sdr.id, u.closer.id, { stage: "WON", wonAt: new Date("2026-09-25T10:00:00Z"), amountCents: 99900, createdAt: new Date("2026-09-10T10:00:00Z") })

    // Meetings: one held, one cancelled, one where the prospect did not come.
    await meeting(l1.id, u.sdr.id, u.closer.id, "COMPLETED")
    await meeting(l2.id, u.sdr.id, u.closer.id, "CANCELED")
    await meeting(l3.id, u.sdr2.id, u.closer2.id, "NO_SHOW")
  })

  const row = (r: Awaited<ReturnType<typeof report.reportOf>>, who: string) => r.people.find((p) => p.userId === u[who].id)

  it("credits each person with what they did in the period", async () => {
    const r = await report.reportOf(u.owner, october)
    expect(r.scope).toBe("all")
    expect(row(r, "sdr")).toMatchObject({ contacted: 2, replied: 1, qualified: 2, meetingsBooked: 1, meetingsHeld: 0, won: 0 })
    expect(row(r, "sdr2")).toMatchObject({ contacted: 1, replied: 0, qualified: 2, meetingsBooked: 1 })
    expect(row(r, "closer")).toMatchObject({ meetingsHeld: 1, won: 1, lost: 1, wonAmounts: [{ currency: "EUR", cents: 450000 }], wonWithoutAmount: 0, winRate: 0.5 })
    expect(row(r, "closer2")).toMatchObject({ meetingsHeld: 0, won: 2, lost: 0, wonAmounts: [{ currency: "USD", cents: 120000 }], wonWithoutAmount: 1, winRate: 1 })
    // Everyone of the team is listed, even with nothing to show.
    expect(r.people).toHaveLength(7)
  })

  it("lists the period's won opportunities with totals per currency", async () => {
    const r = await report.reportOf(u.manager, october)
    expect(r.won.rows.map((w) => w.company)).toEqual(["Alpha", "Charlie", "=HYPERLINK(\"x\")"])
    expect(r.won.rows[0]).toMatchObject({ owner: "closer", createdBy: "sdr", amountCents: 450000, currency: "EUR" })
    expect(r.won.totals).toEqual([{ currency: "EUR", cents: 450000 }, { currency: "USD", cents: 120000 }])
    expect(r.won.withoutAmount).toBe(1)
    // The funnel of the period, and September as the period before.
    expect(r.funnel.current).toMatchObject({ leads: 5, won: 3 })
    expect(r.funnel.previous).toMatchObject({ won: 1 })
  })

  it("shows an SDR and a closer their own figures only; a viewer sees the team", async () => {
    const sdr = await report.reportOf(u.sdr, october)
    expect(sdr.scope).toBe("own")
    expect(sdr.people.map((p) => p.userId)).toEqual([u.sdr.id])
    expect(sdr.won.rows.map((w) => w.company)).toEqual(["Alpha"]) // created by them
    const closer = await report.reportOf(u.closer, october)
    expect(closer.people.map((p) => p.userId)).toEqual([u.closer.id])
    expect(closer.won.rows.map((w) => w.company)).toEqual(["Alpha"])
    expect(closer.funnel.current.leads).toBe(3) // Alpha, Bravo and Delta, through their opportunities (Charlie is closer 2's)
    const viewer = await report.reportOf(u.viewer, october)
    expect(viewer.people).toHaveLength(7)
  })

  it("leaves out a deactivated member with nothing in the period, keeps one who did something", async () => {
    await prisma.user.update({ where: { id: u.manager.id }, data: { active: false } })
    await prisma.user.update({ where: { id: u.closer2.id }, data: { active: false } })
    const ids = (await report.reportOf(u.owner, october)).people.map((p) => p.userId)
    expect(ids).not.toContain(u.manager.id)
    expect(ids).toContain(u.closer2.id)
  })

  it("exports the won list as CSV and writes it in the audit log, without its content", async () => {
    const csv = await report.exportWonCsv(u.owner, october, "1.2.3.4")
    const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n")
    expect(lines).toHaveLength(4)
    expect(lines[1]).toMatch(/^20\/10\/2026;Alpha;closer;sdr;4500,00;EUR;/)
    expect(lines[3]).toContain(`"'=HYPERLINK(""x"")"`)
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "report.exported" } })
    expect(log).toMatchObject({ actorId: u.owner.id, ip: "1.2.3.4", metadata: { report: "won", period: "mois:2026-10", rows: 3 } })
    expect(JSON.stringify(log.metadata)).not.toContain("Alpha")
  })
})
