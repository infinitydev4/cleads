// E16. Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/hq.integration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("3D view figures (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let hq: typeof import("@/features/hq/service")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  const DAY = 86_400_000
  const now = new Date()

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    hq = await import("@/features/hq/service")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["sdr2", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@hq.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
  })

  const lead = async (name: string, ownerId: string | null, extra: object = {}) => {
    const c = await prisma.company.create({ data: { workspaceId: ws, name } })
    return prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, ownerId, ...extra } })
  }
  const meeting = (leadId: string, createdAt: Date, extra: object = {}) =>
    prisma.meeting.create({ data: { workspaceId: ws, hostId: u.closer.id, leadId, createdAt, startsAt: new Date(now.getTime() + DAY), endsAt: new Date(now.getTime() + DAY + 1_800_000), ...extra } })

  it("computes the key figures and their trend against the previous period", async () => {
    // 4 fiches this month, 2 the month before; 2 meetings booked this month (and a cancelled one), 1 before.
    const recent = await Promise.all([1, 2, 3, 4].map((i) => lead(`Récent ${i}`, null, { createdAt: new Date(now.getTime() - i * DAY) })))
    const older = await Promise.all([40, 45].map((d) => lead(`Ancien ${d}`, null, { createdAt: new Date(now.getTime() - d * DAY) })))
    await meeting(recent[0].id, new Date(now.getTime() - 2 * DAY))
    await meeting(recent[1].id, new Date(now.getTime() - 3 * DAY))
    await meeting(recent[2].id, new Date(now.getTime() - 3 * DAY), { status: "CANCELED" })
    await meeting(older[0].id, new Date(now.getTime() - 41 * DAY))

    const o = await hq.getOverview(u.owner, 30, now)
    expect(o.kpis.leads).toEqual({ value: 4, previous: 2, delta: 100 })
    expect(o.kpis.meetings).toMatchObject({ value: 2, previous: 1 })
    expect(o.kpis.conversion.value).toBeCloseTo(0.5)
    expect(o.kpis.conversion.deltaPts).toBeCloseTo(0)
    expect(o.journey.find((j) => j.key === "leads")!.count).toBe(4)
    expect(o.recentLeads.map((l) => l.name)[0]).toBe("Récent 1")
  })

  it("limits every figure to the fiches the person sees", async () => {
    await lead("Mienne", u.sdr.id)
    await lead("Pool", null)
    await lead("Collègue", u.sdr2.id)
    // The fiches were just created: measure up to a moment after them.
    const later = new Date(Date.now() + 1000)
    expect((await hq.getOverview(u.manager, 30, later)).kpis.leads.value).toBe(3)
    expect((await hq.getOverview(u.sdr, 30, later)).kpis.leads.value).toBe(2)
    expect((await hq.getOverview(u.closer, 30, later)).kpis.leads.value).toBe(0)
  })

  it("locks the spaces a role cannot open, and says why instead of failing", async () => {
    const viewer = await hq.getOverview(u.viewer, 30, now)
    expect(viewer.zones.sources).toMatchObject({ locked: true, badge: null })
    expect(viewer.zones.outreach.locked).toBe(true)
    expect(viewer.zones.pipeline.locked).toBe(false)
    expect(await hq.getZone(u.viewer, "sources", 30, now)).toMatchObject({ zone: "sources", locked: true })
    const closer = await hq.getOverview(u.closer, 30, now)
    expect(closer.zones.sources.locked).toBe(true)
    expect(closer.zones.outreach.locked).toBe(false)
    expect((await hq.getOverview(u.sdr, 30, now)).zones.sources.locked).toBe(false)
  })

  it("seats the team by role and shows each person's load only to those who see the whole team", async () => {
    await prisma.task.create({ data: { workspaceId: ws, leadId: (await lead("Tâche", u.sdr.id)).id, assigneeId: u.sdr.id, title: "Rappeler", dueAt: new Date(now.getTime() - 3 * DAY) } })
    const owner = await hq.getOverview(u.owner, 30, now)
    const seat = (id: string) => owner.members.find((m) => m.id === id)!
    expect(seat(u.owner.id).station).toBe("coordination")
    expect(seat(u.sdr.id).station).toBe("qualification")
    expect(seat(u.closer.id).station).toBe("meetings")
    expect(seat(u.sdr.id).load).toMatchObject({ openTasks: 1, overdue: 1, openLeads: 1 })
    const sdr = await hq.getOverview(u.sdr, 30, now)
    expect(sdr.members.find((m) => m.id === u.sdr.id)!.load).not.toBeNull()
    expect(sdr.members.find((m) => m.id === u.owner.id)!.load).toBeNull()
    expect(sdr.zones.coordination).toMatchObject({ tone: "attention", badge: "1 en retard" })
  })

  it("marks a host who is in a meeting right now", async () => {
    const l = await lead("En cours", null)
    await meeting(l.id, new Date(now.getTime() - DAY), { status: "CONFIRMED", startsAt: new Date(now.getTime() - 600_000), endsAt: new Date(now.getTime() + 1_200_000) })
    const o = await hq.getOverview(u.manager, 30, now)
    expect(o.members.find((m) => m.id === u.closer.id)!.status).toBe("meeting")
  })

  it("puts the fiches that answered first in the qualification space", async () => {
    await lead("Contactée", null, { status: "CONTACTED", score: 95 })
    await lead("A répondu", null, { status: "REPLIED", score: 40 })
    const z = await hq.getZone(u.owner, "qualification", 30, now)
    if (!("toQualify" in z)) throw new Error("expected the qualification space")
    expect(z.toQualify.map((l) => l.name)).toEqual(["A répondu", "Contactée"])
    expect(z.counts).toMatchObject({ replied: 1, contacted: 1, fresh: 0 })
  })

  it("lets each member choose their character, and nothing else", async () => {
    expect(await hq.setCharacter(u.sdr, "dev")).toBe("dev")
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.sdr.id } })).hqCharacter).toBe("dev")
    await expect(hq.setCharacter(u.sdr, "dragon")).rejects.toMatchObject({ code: "invalid" })
    expect(await hq.setCharacter(u.sdr, null)).not.toBe("dragon")
  })
})
