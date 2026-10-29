// Needs a disposable PostgreSQL with the migrations applied (never your development database).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("qualification and pipeline (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let leads: typeof import("@/features/leads/service")
  let pipe: typeof import("@/features/pipeline/service")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    leads = await import("@/features/leads/service")
    pipe = await import("@/features/pipeline/service")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["sdr2", "SDR"], ["closer", "CLOSER"], ["closer2", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@pipe.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
  })

  const lead = async (name: string, ownerId: string | null, extra: object = {}) => {
    const c = await prisma.company.create({ data: { workspaceId: ws, name } })
    return prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, ownerId, ...extra } })
  }
  const answers = { need: "Refonte du site", budget: "yes" as const, authority: "decision_maker" as const, timing: "1_3_months" as const }
  const openDeals = (leadId: string) => prisma.deal.findMany({ where: { leadId, stage: { in: ["QUALIFIED", "MEETING_SET", "PROPOSAL", "NEGOTIATION"] } } })

  describe("qualifying", () => {
    it("an SDR qualifies their fiche: answers kept, status Qualified, opportunity handed to a closer", async () => {
      const l = await lead("Dupont", u.sdr.id)
      const { dealId } = await pipe.qualifyLead(u.sdr, l.id, { decision: "qualify", qualification: answers, closerId: u.closer.id })
      const stored = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })
      expect(stored.status).toBe("QUALIFIED")
      expect(stored.qualification).toMatchObject({ need: "Refonte du site", budget: "yes", authority: "decision_maker", updatedById: u.sdr.id })
      const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId! } })
      expect(deal).toMatchObject({ stage: "QUALIFIED", ownerId: u.closer.id, leadId: l.id })
      const history = (await leads.getLead(u.sdr, l.id)).activities.map((a) => a.body)
      expect(history).toEqual(expect.arrayContaining(["Qualifiée", "Opportunité créée"]))
      // The closer now sees the fiche and the opportunity, though they never owned the fiche.
      expect((await leads.getLead(u.closer, l.id)).deals).toHaveLength(1)
    })

    it("qualifying can leave the opportunity unassigned, for a manager to hand out", async () => {
      const l = await lead("Sans closer", u.sdr.id)
      const { dealId } = await pipe.qualifyLead(u.sdr, l.id, { decision: "qualify", qualification: {} })
      expect((await prisma.deal.findUniqueOrThrow({ where: { id: dealId! } })).ownerId).toBeNull()
      expect((await pipe.listBoard(u.manager)).map((d) => d.id)).toContain(dealId)
      expect((await pipe.listBoard(u.sdr)).map((d) => d.id)).toContain(dealId) // the pool
      expect((await pipe.listBoard(u.closer)).map((d) => d.id)).not.toContain(dealId)
    })

    it("two people qualifying the same fiche at once get one opportunity", async () => {
      const l = await lead("Course", null)
      const results = await Promise.allSettled([
        pipe.qualifyLead(u.manager, l.id, { decision: "qualify", qualification: answers, closerId: u.closer.id }),
        pipe.qualifyLead(u.owner, l.id, { decision: "qualify", qualification: answers, closerId: u.closer2.id }),
        pipe.qualifyLead(u.sdr, l.id, { decision: "qualify", qualification: answers }),
      ])
      expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(2)
      expect(await openDeals(l.id)).toHaveLength(1)
    })

    it("qualifying again keeps the same opportunity, and an SDR may still choose the closer while it is at the first stage", async () => {
      const l = await lead("Deux fois", u.sdr.id)
      const first = await pipe.qualifyLead(u.sdr, l.id, { decision: "qualify", qualification: {} })
      const second = await pipe.qualifyLead(u.sdr, l.id, { decision: "qualify", qualification: answers, closerId: u.closer.id })
      expect(second.dealId).toBe(first.dealId)
      expect((await prisma.deal.findUniqueOrThrow({ where: { id: first.dealId! } })).ownerId).toBe(u.closer.id)
      // Once the closer has moved it forward, the SDR can no longer take it away.
      await pipe.updateDeal(u.closer, first.dealId!, { stage: "PROPOSAL" })
      await expect(pipe.qualifyLead(u.sdr, l.id, { decision: "qualify", qualification: {}, closerId: u.closer2.id })).rejects.toMatchObject({ code: "forbidden" })
      expect(await openDeals(l.id)).toHaveLength(1)
    })

    it("refuses what the role cannot do, and never touches the fiche when it refuses", async () => {
      const mine = await lead("À moi", u.closer.id)
      await expect(pipe.qualifyLead(u.closer, mine.id, { decision: "qualify", qualification: {} })).rejects.toMatchObject({ code: "forbidden" })
      await expect(pipe.qualifyLead(u.viewer, mine.id, { decision: "save", qualification: {} })).rejects.toMatchObject({ code: "forbidden" })
      const theirs = await lead("À l’autre SDR", u.sdr2.id)
      await expect(pipe.qualifyLead(u.sdr, theirs.id, { decision: "qualify", qualification: {} })).rejects.toMatchObject({ code: "not_found" })
      expect(await prisma.deal.count()).toBe(0)
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("NEW")
    })

    it("refuses a closer who is not a closer, and a blocked fiche", async () => {
      const l = await lead("Cible", u.sdr.id)
      await expect(pipe.qualifyLead(u.sdr, l.id, { decision: "qualify", qualification: {}, closerId: u.sdr2.id })).rejects.toMatchObject({ code: "invalid" })
      await expect(pipe.qualifyLead(u.sdr, l.id, { decision: "qualify", qualification: {}, closerId: u.viewer.id })).rejects.toMatchObject({ code: "invalid" })
      expect(await prisma.deal.count()).toBe(0)
      const blocked = await lead("Bloquée", u.sdr.id, { status: "DO_NOT_CONTACT" })
      await expect(pipe.qualifyLead(u.sdr, blocked.id, { decision: "qualify", qualification: {} })).rejects.toMatchObject({ code: "conflict" })
    })

    it("saving keeps partial answers without changing the status", async () => {
      const l = await lead("Brouillon", u.sdr.id)
      await pipe.qualifyLead(u.sdr, l.id, { decision: "save", qualification: { need: "À creuser" } })
      await pipe.qualifyLead(u.sdr, l.id, { decision: "save", qualification: { timing: "now" } })
      const stored = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })
      expect(stored.status).toBe("NEW")
      expect(stored.qualification).toMatchObject({ need: "À creuser", timing: "now" })
      expect(await prisma.deal.count()).toBe(0)
    })

    it("disqualifying records the reason and loses what was open", async () => {
      const l = await lead("Plus intéressée", u.sdr.id)
      const { dealId } = await pipe.qualifyLead(u.sdr, l.id, { decision: "qualify", qualification: {}, closerId: u.closer.id })
      await pipe.qualifyLead(u.manager, l.id, { decision: "disqualify", reason: "Pas de budget", detail: "Dit non au devis" })
      const stored = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })
      expect(stored.status).toBe("DISQUALIFIED")
      expect(stored.qualification).toMatchObject({ disqualification: { reason: "Pas de budget", detail: "Dit non au devis" } })
      expect(await prisma.deal.findUniqueOrThrow({ where: { id: dealId! } })).toMatchObject({ stage: "LOST", lostReason: "Prospect disqualifié : Pas de budget" })
      // Qualifying again later clears the disqualification and opens a new opportunity.
      const again = await pipe.qualifyLead(u.sdr2.id === l.ownerId ? u.sdr2 : u.manager, l.id, { decision: "qualify", qualification: answers })
      expect(again.dealId).not.toBe(dealId)
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).qualification).not.toHaveProperty("disqualification")
    })
  })

  describe("the status menu and the pipeline stay consistent", () => {
    it("setting a fiche to Qualified from the menu opens the opportunity, and a closer cannot do it", async () => {
      const l = await lead("Menu", u.sdr.id)
      await leads.updateLead(u.sdr, l.id, { status: "QUALIFIED" })
      expect(await openDeals(l.id)).toHaveLength(1)
      const c = await lead("Du closer", u.closer.id)
      await expect(leads.updateLead(u.closer, c.id, { status: "QUALIFIED" })).rejects.toMatchObject({ code: "forbidden" })
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("NEW")
    })

    it("a fiche cannot leave Qualified while an opportunity is open, but can be disqualified or blocked", async () => {
      const l = await lead("Verrou", u.sdr.id)
      await leads.updateLead(u.sdr, l.id, { status: "QUALIFIED" })
      await expect(leads.updateLead(u.sdr, l.id, { status: "CONTACTED" })).rejects.toMatchObject({ code: "conflict" })
      await leads.updateLead(u.sdr, l.id, { status: "DISQUALIFIED" })
      expect(await openDeals(l.id)).toHaveLength(0)
      expect((await prisma.deal.findFirstOrThrow({ where: { leadId: l.id } })).stage).toBe("LOST")
    })

    it("blocking a prospect loses the open opportunity too", async () => {
      const l = await lead("Bloque-moi", u.sdr.id)
      await leads.updateLead(u.sdr, l.id, { status: "QUALIFIED" })
      await leads.updateLead(u.sdr, l.id, { status: "DO_NOT_CONTACT" })
      expect((await prisma.deal.findFirstOrThrow({ where: { leadId: l.id } })).lostReason).toBe("Ne pas contacter")
    })
  })

  describe("moving cards", () => {
    async function deal(owner: U | null) {
      const l = await lead(`Deal ${Math.random()}`, u.sdr.id)
      const { dealId } = await pipe.qualifyLead(u.sdr, l.id, { decision: "qualify", qualification: {}, closerId: owner?.id ?? null })
      return dealId!
    }

    it("a closer moves their own cards through the stages", async () => {
      const id = await deal(u.closer)
      for (const stage of ["MEETING_SET", "PROPOSAL", "NEGOTIATION", "PROPOSAL"] as const) expect((await pipe.updateDeal(u.closer, id, { stage })).stage).toBe(stage)
      const won = await pipe.updateDeal(u.closer, id, { stage: "WON", amountCents: 450000 })
      expect(won).toMatchObject({ stage: "WON", amountCents: 450000 })
      expect(await prisma.deal.findUniqueOrThrow({ where: { id } })).toMatchObject({ wonAt: expect.any(Date), lostAt: null })
      const acts = (await prisma.activity.findMany({ where: { dealId: id } })).map((a) => a.body)
      expect(acts.filter((b) => b?.startsWith("Opportunité :")).length).toBe(5)
    })

    it("nobody moves a card they may not: other closers, SDRs, viewers", async () => {
      const id = await deal(u.closer)
      await expect(pipe.updateDeal(u.closer2, id, { stage: "PROPOSAL" })).rejects.toMatchObject({ code: "not_found" })
      // An SDR does not even see a closer's card; on a card of the pool they see, they may not move it.
      await expect(pipe.updateDeal(u.sdr, id, { stage: "PROPOSAL" })).rejects.toMatchObject({ code: "not_found" })
      const pooled = await deal(null)
      await expect(pipe.updateDeal(u.sdr, pooled, { stage: "MEETING_SET" })).rejects.toMatchObject({ code: "forbidden" })
      await expect(pipe.updateDeal(u.viewer, id, { stage: "PROPOSAL" })).rejects.toMatchObject({ code: "forbidden" }) // a viewer sees the card, never moves it
      expect((await prisma.deal.findUniqueOrThrow({ where: { id } })).stage).toBe("QUALIFIED")
      expect((await prisma.deal.findUniqueOrThrow({ where: { id: pooled } })).stage).toBe("QUALIFIED")
    })

    it("losing needs a reason; 'Autre' keeps its detail", async () => {
      const id = await deal(u.closer)
      await expect(pipe.updateDeal(u.closer, id, { stage: "LOST" })).rejects.toMatchObject({ code: "invalid" })
      const lost = await pipe.updateDeal(u.closer, id, { stage: "LOST", lostReason: "Autre", lostDetail: "Fusion de l’entreprise" })
      expect(lost.lostReason).toBe("Autre : Fusion de l’entreprise")
    })

    it("only a manager reopens a closed opportunity, and not onto a fiche that already has another open one", async () => {
      const id = await deal(u.closer)
      await pipe.updateDeal(u.closer, id, { stage: "LOST", lostReason: "Budget insuffisant" })
      await expect(pipe.updateDeal(u.closer, id, { stage: "PROPOSAL" })).rejects.toMatchObject({ code: "forbidden" })
      const reopened = await pipe.updateDeal(u.manager, id, { stage: "PROPOSAL" })
      expect(reopened.stage).toBe("PROPOSAL")
      expect(await prisma.deal.findUniqueOrThrow({ where: { id } })).toMatchObject({ lostAt: null, lostReason: null })
      // A second open opportunity on the same fiche is refused.
      const d = await prisma.deal.findUniqueOrThrow({ where: { id } })
      const other = await prisma.deal.create({ data: { workspaceId: ws, leadId: d.leadId, ownerId: u.closer.id, stage: "LOST", lostReason: "x", lostAt: new Date() } })
      await expect(pipe.updateDeal(u.manager, other.id, { stage: "QUALIFIED" })).rejects.toMatchObject({ code: "conflict" })
    })

    it("hands over only by a manager; amounts and dates are edited by who may move the card", async () => {
      const id = await deal(null)
      await expect(pipe.updateDeal(u.closer, id, { ownerId: u.closer.id })).rejects.toMatchObject({ code: "not_found" }) // not theirs yet, not in their view
      await pipe.updateDeal(u.manager, id, { ownerId: u.closer.id })
      await expect(pipe.updateDeal(u.closer, id, { ownerId: u.closer2.id })).rejects.toMatchObject({ code: "forbidden" })
      await expect(pipe.updateDeal(u.manager, id, { ownerId: u.sdr.id })).rejects.toMatchObject({ code: "invalid" })
      const edited = await pipe.updateDeal(u.closer, id, { amountCents: 120000, expectedCloseAt: "2026-12-15T00:00:00.000Z" })
      expect(edited).toMatchObject({ amountCents: 120000, expectedCloseAt: "2026-12-15T00:00:00.000Z" })
      await expect(pipe.updateDeal(u.sdr, await deal(null), { amountCents: 1 })).rejects.toMatchObject({ code: "forbidden" })
    })
  })

  describe("the board", () => {
    it("shows each role what it should, and recent results only", async () => {
      const mk = async (owner: U | null, stage: "QUALIFIED" | "WON" | "LOST", closedDaysAgo = 0) => {
        const l = await lead(`B ${Math.random()}`, u.sdr.id)
        const when = new Date(Date.now() - closedDaysAgo * 86400000)
        return prisma.deal.create({ data: { workspaceId: ws, leadId: l.id, ownerId: owner?.id ?? null, stage, wonAt: stage === "WON" ? when : null, lostAt: stage === "LOST" ? when : null, lostReason: stage === "LOST" ? "x" : null } })
      }
      const mine = await mk(u.closer, "QUALIFIED")
      const theirs = await mk(u.closer2, "QUALIFIED")
      const pool = await mk(null, "QUALIFIED")
      const wonRecent = await mk(u.closer, "WON", 3)
      const wonOld = await mk(u.closer, "WON", 45)
      const ids = async (user: U, f = {}) => (await pipe.listBoard(user, f)).map((d) => d.id).sort()
      expect(await ids(u.closer)).toEqual([mine.id, wonRecent.id].sort())
      expect(await ids(u.manager)).toEqual([mine.id, theirs.id, pool.id, wonRecent.id].sort())
      expect(await ids(u.manager)).not.toContain(wonOld.id)
      expect(await ids(u.viewer)).toHaveLength(4)
      expect(await ids(u.sdr)).toEqual([mine.id, theirs.id, pool.id, wonRecent.id].sort().filter((id) => id === pool.id))
      expect(await ids(u.manager, { owner: "none" })).toEqual([pool.id])
      expect(await ids(u.manager, { owner: u.closer2.id })).toEqual([theirs.id])
      const cards = await pipe.listBoard(u.closer)
      expect(cards.every((c) => c.canMove)).toBe(true)
      expect((await pipe.listBoard(u.viewer)).every((c) => !c.canMove)).toBe(true)
    })
  })
})
