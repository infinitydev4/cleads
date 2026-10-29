// Needs a disposable PostgreSQL with the migrations applied (never your development database).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PrismaClient } from "@prisma/client"
import { resetDemo, seedDemo } from "../features/demo/seed"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("demo data (database)", () => {
  let prisma: PrismaClient
  let staff: { id: string; role: string }[]
  const workspaceId = "ws_default"

  beforeAll(() => {
    prisma = new PrismaClient({ datasources: { db: { url } } })
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    for (const table of ["Meeting", "Activity", "Task", "Deal", "Lead", "Contact", "Company", "ImportBatch", "AuditLog", "Invitation", "User"]) await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)
    const [sdr, closer] = await Promise.all([
      prisma.user.create({ data: { email: "sdr@demo.test", role: "SDR", workspaceId } }),
      prisma.user.create({ data: { email: "closer@demo.test", role: "CLOSER", workspaceId } }),
    ])
    staff = [sdr, closer]
  })

  it("creates a coherent set that respects every database rule, and only fictitious data", async () => {
    const created = await seedDemo(prisma, { workspaceId, staff, companies: 40, now: new Date("2026-10-30T10:00:00Z") })
    expect(created.companies).toBe(40)
    expect(created.leads).toBe(40)
    expect(created.deals).toBeGreaterThan(0)
    expect(created.meetings).toBe(created.deals)

    const companies = await prisma.company.findMany()
    expect(companies.every((c) => c.domain?.endsWith(".example.test") && /^01 99 00 /.test(c.phone ?? ""))).toBe(true)
    const contacts = await prisma.contact.findMany()
    expect(contacts.every((c) => c.email?.endsWith(".example.test"))).toBe(true)
    // Qualified leads are the only ones with a deal, and the unassigned pool exists for the SDR scope.
    expect(await prisma.deal.count({ where: { lead: { status: { not: "QUALIFIED" } } } })).toBe(0)
    expect(await prisma.lead.count({ where: { ownerId: null } })).toBeGreaterThan(0)
  })

  it("is repeatable and reversible", async () => {
    const first = await seedDemo(prisma, { workspaceId, staff, companies: 15, now: new Date("2026-10-30T10:00:00Z") })
    const second = await seedDemo(prisma, { workspaceId, staff, companies: 15, now: new Date("2026-10-30T10:00:00Z") })
    expect(second.companies).toBe(0)
    expect(await prisma.company.count()).toBe(first.companies)

    expect(await resetDemo(prisma, workspaceId)).toEqual({ companies: 15 })
    expect(await prisma.company.count()).toBe(0)
    expect(await prisma.lead.count()).toBe(0)
    expect(await prisma.meeting.count()).toBe(0)
  })

  it("does not touch real records when resetting", async () => {
    await prisma.company.create({ data: { workspaceId, name: "Vraie entreprise", externalId: "gm:real" } })
    await seedDemo(prisma, { workspaceId, staff, companies: 5 })
    await resetDemo(prisma, workspaceId)
    expect(await prisma.company.count()).toBe(1)
  })
})
