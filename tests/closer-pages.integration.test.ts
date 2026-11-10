// Closer pages v2 (10 November 2026): the daily call goal owners and managers set, the calls day by day of « Mes
// résultats », and the closer's menu label.
// Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/closer-pages.integration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { resetDatabase } from "./helpers/reset-db"
import { navFor } from "@/lib/crm/nav"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

it("names the reports « Mes résultats » for a closer, and keeps « Rapports » for the others", () => {
  const labels = (role: "CLOSER" | "MANAGER") => navFor(role).groups.flatMap((g) => g.items.map((i) => i.label))
  expect(labels("CLOSER")).toContain("Mes résultats")
  expect(labels("MANAGER")).toContain("Rapports")
})

suite("closer pages v2 (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let desk: typeof import("@/features/leads/desk")
  let stats: typeof import("@/features/telephony/stats")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let leadId = ""

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    desk = await import("@/features/leads/desk")
    stats = await import("@/features/telephony/stats")
  })
  afterAll(async () => {
    await prisma.workspace.update({ where: { id: ws }, data: { dailyCallGoal: 40 } })
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await resetDatabase(prisma)
    await prisma.workspace.update({ where: { id: ws }, data: { dailyCallGoal: 40 } })
    for (const [key, role] of [["closer", "CLOSER"], ["other", "CLOSER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@pages.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
    const company = await prisma.company.create({ data: { workspaceId: ws, name: "Plomberie" } })
    leadId = (await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, ownerId: u.closer.id } })).id
  })

  it("gives every closer the team's call goal, 40 until someone sets it, within 1 to 500", async () => {
    expect((await desk.deskStats(u.closer)).goal).toBe(40)
    expect(await desk.setDailyCallGoal(ws, 60)).toBe(60)
    expect((await desk.deskStats(u.closer)).goal).toBe(60)
    expect(await desk.dailyCallGoal(ws)).toBe(60)
    await expect(desk.setDailyCallGoal(ws, 0)).rejects.toThrow(RangeError)
    await expect(desk.setDailyCallGoal(ws, 501)).rejects.toThrow(RangeError)
  })

  it("counts calls day by day, picked up when the closer said « Joint » or the PBX said answered, own or team", async () => {
    const from = new Date("2026-11-08T23:00:00Z") // Monday 9 November, Paris midnight
    const to = new Date("2026-11-15T23:00:00Z")
    const call = (actorId: string, at: string, data: object) => prisma.activity.create({ data: { workspaceId: ws, leadId, actorId, kind: "CALL", occurredAt: new Date(at), data } })
    await call(u.closer.id, "2026-11-09T09:00:00Z", { outcome: "reached" })
    await call(u.closer.id, "2026-11-09T10:00:00Z", { outcome: "no_answer", disposition: "no answer", durationSec: 0 })
    await call(u.closer.id, "2026-11-11T10:00:00Z", { disposition: "answered", durationSec: 252, pending: true })
    await call(u.other.id, "2026-11-11T11:00:00Z", { outcome: "reached", disposition: "answered", durationSec: 60 })
    await call(u.closer.id, "2026-11-16T10:00:00Z", { outcome: "reached" })

    const own = await stats.callsByDay(u.closer, from, to, "own")
    expect(own.map((d) => d.day)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"])
    expect(own[0]).toEqual({ day: "2026-11-09", calls: 2, answered: 1, talkSec: 0 })
    expect(own[2]).toEqual({ day: "2026-11-11", calls: 1, answered: 1, talkSec: 252 })
    const team = await stats.callsByDay(u.closer, from, to, "all")
    expect(team[2]).toMatchObject({ calls: 2, answered: 2, talkSec: 312 })
    expect(team.reduce((t, d) => t + d.calls, 0)).toBe(4)
  })
})
