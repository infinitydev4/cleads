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

  describe("the AI agency (E26)", () => {
    const run = (agentId: string, status: string, requestedById: string, extra: object = {}) =>
      prisma.agentRun.create({ data: { workspaceId: ws, agentId, status: status as never, requestedById, capMicros: 100_000, ...extra } })
    const site = (leadId: string, extra: object) => prisma.generatedSite.create({ data: { workspaceId: ws, leadId, companyName: "Démo", purgeAfter: new Date(now.getTime() + 90 * DAY), ...extra } })

    it("shows each agent at work with the rules of Agents IA: the team's runs for managers, one's own otherwise", async () => {
      const mine = await lead("Plomberie de la SDR", u.sdr.id)
      const theirs = await lead("Fiche de la collègue", u.sdr2.id)
      await run("auditor", "RUNNING", u.sdr.id, { leadId: mine.id, costMicros: 14_000 })
      const waiting = await run("writer", "WAITING_APPROVAL", u.sdr2.id, { leadId: theirs.id })
      await prisma.agentApproval.create({ data: { workspaceId: ws, runId: waiting.id, tool: "send_email", payload: {}, summary: "Envoyer l’email", requestedById: u.sdr2.id, expiresAt: new Date(Date.now() + DAY) } })
      await run("qualifier", "SUCCEEDED", u.manager.id, { finishedAt: new Date(Date.now() - 5_000) })
      await run("strategist", "QUEUED", u.manager.id)
      await prisma.agentDefinition.create({ data: { workspaceId: ws, agentId: "replies", enabled: false } })
      const at = new Date(Date.now() + 1000)

      const team = (await hq.getOverview(u.owner, 30, at)).agency!
      const of = (id: string) => team.agents.find((a) => a.id === id)!
      expect(of("auditor")).toMatchObject({ state: "working", running: 1, current: { lead: { name: "Plomberie de la SDR" } }, today: { runs: 1, costEur: 0.014 } })
      expect(of("writer")).toMatchObject({ state: "waiting", waiting: 1 })
      expect(of("qualifier")).toMatchObject({ state: "idle", lastDone: { ok: true } })
      expect(of("strategist").state).toBe("queued")
      expect(of("replies").state).toBe("off")
      expect(team.approvals).toBe(1)
      // No worker has said it is alive: runs wait in the queue.
      expect(team.worker).toEqual({ online: false, queued: 1 })

      const sdr = (await hq.getOverview(u.sdr, 30, at)).agency!
      expect(sdr.agents.find((a) => a.id === "auditor")!.state).toBe("working")
      expect(sdr.agents.find((a) => a.id === "writer")!.state).toBe("idle")
      expect(sdr.agents.find((a) => a.id === "strategist")!.state).toBe("idle")
      expect(sdr.approvals).toBe(0)
    })

    it("gives the AI spaces their badges, and locks them for a role without the AI or the Studio", async () => {
      await run("auditor", "RUNNING", u.owner.id)
      const waiting = await run("writer", "WAITING_APPROVAL", u.owner.id)
      await prisma.agentApproval.create({ data: { workspaceId: ws, runId: waiting.id, tool: "send_email", payload: {}, summary: "Envoyer l’email", requestedById: u.owner.id, expiresAt: new Date(Date.now() + DAY) } })
      const owner = await hq.getOverview(u.owner, 30, new Date(Date.now() + 1000))
      expect(owner.zones.agents).toEqual({ badge: "1 à valider", tone: "attention", locked: false })
      expect(owner.zones.studio).toEqual({ badge: "Aucune maquette", tone: "neutral", locked: false })
      const viewer = await hq.getOverview(u.viewer, 30, now)
      expect(viewer.agency).toBeNull()
      expect(viewer.zones.agents).toMatchObject({ locked: true, badge: null })
      expect(viewer.zones.studio.locked).toBe(true)
      expect(await hq.getZone(u.viewer, "agents", 30, now)).toMatchObject({ zone: "agents", locked: true })
      expect(await hq.getZone(u.viewer, "studio", 30, now)).toMatchObject({ zone: "studio", locked: true })
    })

    it("details the control room: the agents with their model, what waits for a decision, the latest runs", async () => {
      const waiting = await run("writer", "WAITING_APPROVAL", u.sdr.id)
      await prisma.agentApproval.create({ data: { workspaceId: ws, runId: waiting.id, tool: "send_email", payload: {}, summary: "Envoyer l’email", requestedById: u.sdr.id, expiresAt: new Date(Date.now() + DAY) } })
      const z = await hq.getZone(u.manager, "agents", 30, now)
      if (z.zone !== "agents" || "locked" in z) throw new Error("expected the control room")
      expect(z.agents).toHaveLength(8)
      expect(z.agents.every((a) => a.model.length > 0 && a.mission.length > 20)).toBe(true)
      expect(z.approvals.map((a) => a.summary)).toEqual(["Envoyer l’email"])
      expect(z.approvals[0].canDecide).toBe(true)
      expect(z.runs.map((r) => r.agentId)).toEqual(["writer"])
      expect(z.month.capEur).toBeGreaterThan(0)
      // A colleague's approval is not the SDR's to see.
      const other = await hq.getZone(u.sdr2, "agents", 30, now)
      if (other.zone !== "agents" || "locked" in other) throw new Error("expected the control room")
      expect(other.approvals).toEqual([])
    })

    it("hangs in the Studio's gallery only the mock-ups of the fiches the person sees, with a picture", async () => {
      const mine = await lead("Ma fiche", u.sdr.id)
      const theirs = await lead("Sa fiche", u.sdr2.id)
      await site(theirs.id, { status: "READY", currentVersion: 2, visitCount: 3 })
      await site(mine.id, { status: "BRIEF_READY" })
      const building = await run("designer", "RUNNING", u.sdr.id, { leadId: mine.id })
      await site(mine.id, { status: "BUILDING", lastRunId: building.id })
      await site(mine.id, { status: "BUILDING", lastRunId: (await run("designer", "FAILED", u.sdr.id, { leadId: mine.id })).id })

      const team = (await hq.getOverview(u.owner, 30, now)).agency!.studio!
      expect(team.latest).toHaveLength(1)
      expect(team.latest[0]).toMatchObject({ name: "Sa fiche", version: 2 })
      expect(team.latest[0].thumb).toMatch(/\/api\/studio\/sites\/.+\/versions\/2\/thumb$/)
      // A failed generation does not count as in progress.
      expect(team).toMatchObject({ building: 1, briefs: 1, ready: 1 })
      const sdr = (await hq.getOverview(u.sdr, 30, now)).agency!.studio!
      expect(sdr).toMatchObject({ latest: [], building: 1, briefs: 1, ready: 0 })
      const z = await hq.getZone(u.owner, "studio", 30, now)
      if (z.zone !== "studio" || "locked" in z) throw new Error("expected the Studio")
      expect(z.counts).toEqual({ ready: 1, building: 1, briefs: 1, visits: 3 })
      expect(z.sites).toHaveLength(4)
    })
  })

  it("lets each member choose their character, and nothing else", async () => {
    expect(await hq.setCharacter(u.sdr, "dev")).toBe("dev")
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.sdr.id } })).hqCharacter).toBe("dev")
    await expect(hq.setCharacter(u.sdr, "dragon")).rejects.toMatchObject({ code: "invalid" })
    expect(await hq.setCharacter(u.sdr, null)).not.toBe("dragon")
  })
})
