// E15. Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/campaigns.integration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("campaigns (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let campaigns: typeof import("@/features/campaigns/service")
  let leads: typeof import("@/features/leads/service")
  let importer: typeof import("@/features/leads/import")
  let schemas: typeof import("@/features/campaigns/schemas")
  let parse: typeof import("@/features/leads/schemas").parseLeadFilters
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    campaigns = await import("@/features/campaigns/service")
    leads = await import("@/features/leads/service")
    importer = await import("@/features/leads/import")
    schemas = await import("@/features/campaigns/schemas")
    parse = (await import("@/features/leads/schemas")).parseLeadFilters
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["sdr2", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@camp.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
  })

  const lead = async (name: string, ownerId: string | null, extra: object = {}) => {
    const c = await prisma.company.create({ data: { workspaceId: ws, name, city: "Lyon" } })
    return prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, ownerId, ...extra } })
  }
  const create = (by: U, name: string, extra: object = {}) => campaigns.createCampaign(by, schemas.createCampaignSchema.parse({ name, ...extra }))
  const mailbox = () => prisma.mailbox.create({ data: { workspaceId: ws, address: "box@send.example.test", displayName: "Box", smtpHost: "smtp.example.test", smtpPort: 465, username: "box", secret: "v1.x.x.x" } })
  let n = 0
  const email = (mailboxId: string, leadId: string, direction: "OUTBOUND" | "INBOUND", extra: object = {}) =>
    prisma.emailMessage.create({ data: { workspaceId: ws, mailboxId, leadId, direction, status: direction === "OUTBOUND" ? "SENT" : "RECEIVED", fromEmail: "a@x.test", toEmail: "b@x.test", subject: "s", bodyText: "b", messageId: `<m${++n}@test>`, ...extra } })

  describe("creating and editing", () => {
    it("creates a draft owned by its author; the name is unique", async () => {
      const { id } = await create(u.sdr, "Plombiers – Lyon", { sector: "Plomberie", area: "Lyon" })
      const c = await prisma.campaign.findUniqueOrThrow({ where: { id } })
      expect(c).toMatchObject({ status: "DRAFT", ownerId: u.sdr.id, createdById: u.sdr.id, sector: "Plomberie" })
      await expect(create(u.manager, "Plombiers – Lyon")).rejects.toMatchObject({ code: "duplicate", status: 409 })
      expect(await prisma.auditLog.count({ where: { action: "campaign.created", entityId: id } })).toBe(1)
    })

    it("refuses closers and readers, an inactive owner, and dates in the wrong order", async () => {
      await expect(create(u.closer, "Non")).rejects.toMatchObject({ status: 403 })
      await expect(create(u.viewer, "Non")).rejects.toMatchObject({ status: 403 })
      await prisma.user.update({ where: { id: u.sdr2.id }, data: { active: false } })
      await expect(create(u.owner, "Inactif", { ownerId: u.sdr2.id })).rejects.toMatchObject({ code: "invalid" })
      expect(() => schemas.createCampaignSchema.parse({ name: "Dates", startsOn: "2026-11-10", endsOn: "2026-11-01" })).toThrow()
      const { id } = await create(u.owner, "Dates", { startsOn: "2026-11-01" })
      await expect(campaigns.updateCampaign(u.owner, id, { endsOn: "2026-10-01" })).rejects.toMatchObject({ code: "invalid" })
    })

    it("changes status, archives and restores, each in the audit log", async () => {
      const { id } = await create(u.manager, "Cycle")
      await campaigns.updateCampaign(u.manager, id, { status: "ACTIVE" })
      await campaigns.updateCampaign(u.manager, id, { archived: true })
      expect((await campaigns.listCampaigns(u.manager)).map((c) => c.id)).not.toContain(id)
      expect((await campaigns.listCampaigns(u.manager, { archived: true })).map((c) => c.id)).toContain(id)
      await campaigns.updateCampaign(u.manager, id, { archived: false })
      const actions = (await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } })).map((a) => a.action)
      expect(actions).toEqual(["campaign.created", "campaign.updated", "campaign.archived", "campaign.restored"])
    })
  })

  describe("filing fiches", () => {
    it("files the fiches the person may write, refuses the others, and writes the history", async () => {
      const { id } = await create(u.owner, "Ciblage")
      const mine = await lead("A moi", u.sdr.id)
      const pool = await lead("Pool", null)
      const other = await lead("Collègue", u.sdr2.id)
      const r = await leads.bulkUpdate(u.sdr, { ids: [mine.id, pool.id, other.id], action: { type: "campaign", campaignId: id } })
      expect(r).toMatchObject({ updated: 2, notAllowed: 1 })
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: other.id } })).campaignId).toBeNull()
      const history = (await leads.getLead(u.sdr, mine.id)).activities.map((a) => a.body)
      expect(history).toContain("Rangée dans la campagne « Ciblage » (action groupée)")
      // A closer may write their fiches but not file them in a campaign.
      const closers = await lead("Closer", u.closer.id)
      await expect(leads.bulkUpdate(u.closer, { ids: [closers.id], action: { type: "campaign", campaignId: id } })).rejects.toMatchObject({ status: 403 })
    })

    it("moves a fiche between campaigns from its page, and refuses an archived campaign", async () => {
      const a = await create(u.owner, "Alpha")
      const b = await create(u.owner, "Bravo")
      const l = await lead("Fiche", u.sdr.id)
      await leads.updateLead(u.sdr, l.id, { campaignId: a.id })
      await leads.updateLead(u.sdr, l.id, { campaignId: b.id })
      const detail = await leads.getLead(u.sdr, l.id)
      expect(detail.campaign).toMatchObject({ id: b.id, name: "Bravo" })
      expect(detail.activities.map((x) => x.body)).toContain("Rangée dans la campagne « Bravo » (venait de « Alpha »)")
      await campaigns.updateCampaign(u.owner, a.id, { archived: true })
      await expect(leads.updateLead(u.sdr, l.id, { campaignId: a.id })).rejects.toMatchObject({ code: "conflict" })
      await leads.updateLead(u.sdr, l.id, { campaignId: null })
      expect((await leads.getLead(u.sdr, l.id)).campaign).toBeNull()
    })

    it("lists a campaign's fiches, and those outside every campaign", async () => {
      const { id } = await create(u.owner, "Liste")
      const inside = await lead("Dedans", null, { campaignId: id })
      const outside = await lead("Dehors", null)
      const ids = async (q: Record<string, string>) => (await leads.listLeads(u.owner, parse(q))).rows.map((r) => r.id)
      expect(await ids({ campaign: id })).toEqual([inside.id])
      expect(await ids({ campaign: "none" })).toEqual([outside.id])
    })

    it("an import files new fiches, and existing ones outside every campaign, but never takes one from another campaign", async () => {
      const first = await create(u.owner, "Premier")
      const second = await create(u.owner, "Second")
      const rows = [{ name: "Alpha", city: "Lyon", phone: "0478000001" }, { name: "Beta", city: "Lyon", phone: "0478000002" }]
      const one = await importer.runImport(u.sdr, rows, { commit: true, source: "CSV", fileName: "a.csv", campaignId: first.id })
      expect(one.summary).toMatchObject({ created: 2, campaign: { filed: 2, keptElsewhere: 0 } })
      // An existing fiche without a campaign joins the second one; the two already in "Premier" stay there.
      const loose = await lead("Gamma", null)
      await prisma.company.update({ where: { id: loose.companyId! }, data: { phone: "+33478000003", nameKey: null } })
      const two = await importer.runImport(u.sdr, [...rows, { name: "Gamma", city: "Lyon", phone: "0478000003" }], { commit: true, source: "CSV", fileName: "b.csv", campaignId: second.id })
      expect(two.summary).toMatchObject({ created: 0, existing: 3, campaign: { filed: 1, keptElsewhere: 2 } })
      const byName = Object.fromEntries((await prisma.lead.findMany({ include: { company: true } })).map((l) => [l.company!.name, l.campaignId]))
      expect(byName).toEqual({ Alpha: first.id, Beta: first.id, Gamma: second.id })
      // Preview writes nothing; a reader cannot file.
      await expect(importer.runImport(u.closer, rows, { commit: false, source: "CSV", campaignId: first.id })).rejects.toMatchObject({ status: 403 })
    })
  })

  describe("figures", () => {
    it("counts how far the campaign's fiches went, each step as defined", async () => {
      const { id } = await create(u.owner, "Mesures")
      const box = await mailbox()
      const emailed = await lead("Email", null, { campaignId: id })
      const called = await lead("Appel", null, { campaignId: id })
      const replied = await lead("Réponse", null, { campaignId: id })
      const away = await lead("Absent", null, { campaignId: id })
      const won = await lead("Gagné", null, { campaignId: id })
      await lead("Hors campagne", null)
      await email(box.id, emailed.id, "OUTBOUND")
      await email(box.id, emailed.id, "OUTBOUND", { isTest: true }) // tests never count
      await prisma.activity.create({ data: { workspaceId: ws, leadId: called.id, kind: "CALL", body: "Appel" } })
      await email(box.id, replied.id, "OUTBOUND")
      await email(box.id, replied.id, "INBOUND")
      await email(box.id, away.id, "OUTBOUND")
      await email(box.id, away.id, "INBOUND", { replyClass: "OUT_OF_OFFICE" }) // an automatic reply is not an answer
      await prisma.deal.create({ data: { workspaceId: ws, leadId: won.id, stage: "WON", wonAt: new Date() } })
      await prisma.deal.create({ data: { workspaceId: ws, leadId: replied.id, stage: "QUALIFIED" } })
      await prisma.meeting.create({ data: { workspaceId: ws, hostId: u.closer.id, leadId: replied.id, startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000) } })
      await prisma.meeting.create({ data: { workspaceId: ws, hostId: u.closer.id, leadId: away.id, status: "CANCELED", startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000) } })

      const c = (await campaigns.listCampaigns(u.owner)).find((x) => x.id === id)!
      expect(c.stats).toMatchObject({ leads: 5, contacted: 4, replied: 1, qualified: 2, meetings: 1, won: 1 })
      expect(c.stats.replyRate).toBeCloseTo(1 / 4)
      expect(c.stats.conversion).toBeCloseTo(1 / 5)
      const detail = await campaigns.getCampaign(u.owner, id)
      expect(detail.recent).toMatchObject({ leads: 5, contacted: 4, replied: 1, meetings: 1, won: 1 })
    })

    it("limits the figures to the fiches the person sees", async () => {
      const { id } = await create(u.owner, "Portée")
      await lead("Mienne", u.sdr.id, { campaignId: id })
      await lead("Pool", null, { campaignId: id })
      await lead("Collègue", u.sdr2.id, { campaignId: id })
      const stats = async (who: U) => (await campaigns.listCampaigns(who)).find((x) => x.id === id)!.stats.leads
      expect(await stats(u.owner)).toBe(3)
      expect(await stats(u.viewer)).toBe(3)
      expect(await stats(u.sdr)).toBe(2)
      expect(await stats(u.closer)).toBe(0)
    })
  })
})
