// The closer's desk (9 November 2026): the list's glance (site, offer, follow-up, signal, priority), the four segments
// of the call file and their counts, and the fiche's call brief with its layout and its rights.
// Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/closer-desk.integration.test.ts
// Times are relative to the real clock: the list reads « today » from it.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const DAY = 86_400_000

suite("the closer's desk (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let leads: typeof import("@/features/leads/service")
  let schemas: typeof import("@/features/leads/schemas")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  const id: Record<string, string> = {}

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    leads = await import("@/features/leads/service")
    schemas = await import("@/features/leads/schemas")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function fiche(key: string, owner: string, o: { website?: string; domain?: string; phone?: string | null; status?: "NEW" | "CONTACTED" | "REPLIED"; score?: number; contacted?: boolean; legal?: "ACTIVE" | "INSOLVENT" }) {
    const company = await prisma.company.create({
      data: { workspaceId: ws, name: key, website: o.website ?? null, domain: o.domain ?? null, phone: o.phone === undefined ? "0240000000" : o.phone, legalState: o.legal ?? "ACTIVE" },
    })
    const lead = await prisma.lead.create({
      data: { workspaceId: ws, companyId: company.id, ownerId: owner, status: o.status ?? "NEW", score: o.score ?? 50, lastContactedAt: o.contacted ? new Date(Date.now() - 3 * DAY) : null },
    })
    id[key] = lead.id
    id[`${key}:company`] = company.id
  }

  async function pitch(key: string) {
    const p = await prisma.offerPitch.create({
      data: {
        workspaceId: ws,
        leadId: id[key],
        headline: "Ses publicités mènent à un site lent.",
        script: { opening: "Bonjour Inès, Yanis de Cleads.", hook: { text: "Votre page met 9 secondes à s'ouvrir sur mobile ?", evidence: ["M1"] }, questions: ["Combien de réservations par semaine ?"], proposal: "Une landing rapide.", close: "Jeudi 10h ou vendredi 14h ?" },
        objections: [{ objection: "C'est trop cher", answer: "Un client de plus par mois la rembourse." }],
        evidence: [],
      },
    })
    const rec = (rank: number, name: string, status: "SUGGESTED" | "REJECTED", price: number) => ({
      workspaceId: ws, pitchId: p.id, rank, role: "MAIN" as const, offerSlug: `o${rank}`, offerName: name, category: "WEBSITE" as const, priceMinEur: price, priceMaxEur: price, billing: "ONE_OFF" as const, fit: 80, why: `Pourquoi ${name}`, gain: `Gain ${name}`, evidence: ["M1"], status,
      decidedAt: status === "SUGGESTED" ? null : new Date(),
    })
    await prisma.offerRecommendation.createMany({ data: [rec(1, "Landing de conversion", "SUGGESTED", 1100), rec(2, "Refusée", "REJECTED", 900), rec(3, "Refonte du site", "SUGGESTED", 2400)] })
  }

  beforeEach(async () => {
    await resetDatabase(prisma)
    for (const [key, role] of [["owner", "OWNER"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@desk.test`, name: `${key} Test`, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: `${key} Test`, email: x.email!, image: null, role }
    }
    const c = u.closer.id
    await fiche("Plomberie", c, { score: 85 })
    await fiche("Salon", c, { website: "https://salon.example", domain: "salon.example", status: "CONTACTED", score: 60, contacted: true })
    await fiche("Garage", c, { website: "https://garage.example", domain: "garage.example", status: "CONTACTED", score: 55, contacted: true })
    await fiche("Boulangerie", c, { website: "https://boulangerie.example", domain: "boulangerie.example", phone: null })
    await fiche("Faillite", c, { website: "https://faillite.example", score: 90, legal: "INSOLVENT" })
    await fiche("Autre", u.owner.id, { score: 95 })

    // The salon: an audit of its own, a callback due an hour ago, a recent ad signal and an old one, a pitch.
    await prisma.prospectAudit.create({ data: { workspaceId: ws, leadId: id.Salon, domain: "salon.example", status: "COMPLETE", scores: {}, score: 42, summary: ["Mobile : 9 secondes.", "Pas de réservation en ligne."], report: {}, validUntil: new Date(Date.now() + 20 * DAY) } })
    await prisma.task.create({ data: { workspaceId: ws, leadId: id.Salon, assigneeId: c, title: "Rappeler Inès", dueAt: new Date(Date.now() - 3_600_000) } })
    const signal = (key: string, days: number, summary: string) => ({ workspaceId: ws, companyId: id[`${key}:company`], kind: "ADS_RUNNING" as const, occurredAt: new Date(Date.now() - days * DAY), summary, source: "Bibliothèque publicitaire Meta", sourceUrl: "https://www.facebook.com/ads/library/?id=1", externalKey: `meta:${key}:${days}`, expiresAt: new Date(Date.now() + 30 * DAY) })
    await prisma.companySignal.createMany({ data: [signal("Salon", 5, "3 publicités actives sur Facebook et Instagram"), signal("Garage", 60, "Ancienne campagne")] })
    await pitch("Salon")
    // The garage: an audit made for another fiche of the same domain, still fresh, and an upcoming task.
    await prisma.prospectAudit.create({ data: { workspaceId: ws, domain: "garage.example", status: "COMPLETE", scores: {}, score: 82, summary: [], report: {}, validUntil: new Date(Date.now() + 20 * DAY) } })
    await prisma.task.create({ data: { workspaceId: ws, leadId: id.Garage, assigneeId: c, title: "Relancer après devis", dueAt: new Date(Date.now() + 3 * DAY) } })
  })

  const list = (user: U, params: Record<string, string> = {}) => leads.listLeads(user, schemas.parseLeadFilters(params))
  const names = async (user: U, params: Record<string, string> = {}) => new Set((await list(user, params)).rows.map((r) => r.name))

  it("shows each of the closer's fiches with its site, offer, follow-up, signal and priority", async () => {
    const rows = Object.fromEntries((await list(u.closer)).rows.map((r) => [r.name, r]))
    expect(Object.keys(rows).sort()).toEqual(["Boulangerie", "Faillite", "Garage", "Plomberie", "Salon"])

    expect(rows.Plomberie).toMatchObject({ site: "none", offer: null, next: null, signal: null, priority: 1 })
    expect(rows.Salon).toMatchObject({ site: "weak", offer: { name: "Landing de conversion", price: expect.stringMatching(/^1\s100\s€ HT$/) }, signal: "3 publicités actives sur Facebook et Instagram", priority: 1 })
    expect(rows.Salon.next).toMatchObject({ title: "Rappeler Inès", late: true })
    // An old signal is no reason to call; a fresh audit of the same domain tells the site.
    expect(rows.Garage).toMatchObject({ site: "ok", signal: null, priority: 2 })
    expect(rows.Garage.next).toMatchObject({ title: "Relancer après devis", late: false })
    expect(rows.Boulangerie).toMatchObject({ site: "unknown", priority: 3 })
    expect(rows.Faillite.priority).toBe(3)
  })

  it("narrows the call file to one segment, with the same rules, and counts each", async () => {
    expect(await names(u.closer, { focus: "hot" })).toEqual(new Set(["Plomberie", "Salon"]))
    expect(await names(u.closer, { focus: "callback" })).toEqual(new Set(["Salon"]))
    expect(await names(u.closer, { focus: "nosite" })).toEqual(new Set(["Plomberie"]))
    expect(await names(u.closer, { focus: "fresh" })).toEqual(new Set(["Plomberie", "Boulangerie", "Faillite"]))
    expect(await leads.focusCounts(u.closer)).toEqual({ hot: 2, callback: 1, nosite: 1, fresh: 3 })
    // The owner's counts take every fiche, his own hot one included.
    expect((await leads.focusCounts(u.owner)).hot).toBe(3)
    // A segment keeps to what the person sees.
    expect(await names(u.closer, { focus: "nosite", q: "Autre" })).toEqual(new Set())
  })

  it("opens the closer's fiche on the call: why now with its sources, the script, the offers left, the objections", async () => {
    const fiche = await leads.getLead(u.closer, id.Salon)
    expect(fiche.layout).toBe("focus")
    const { brief } = fiche
    expect(brief).toMatchObject({ priority: 1, site: "weak", siteScore: 42, audited: true })
    expect(brief.reasons.map((r) => r.source)).toEqual(["Tâche", "Bibliothèque publicitaire Meta", expect.stringMatching(/^Audit IA du /), expect.stringMatching(/^Audit IA du /)])
    expect(brief.reasons[0].text).toMatch(/^Rappeler Inès : /)
    expect(brief.reasons[1]).toMatchObject({ text: "3 publicités actives sur Facebook et Instagram", url: "https://www.facebook.com/ads/library/?id=1" })
    expect(brief.pitch?.script?.hook.text).toBe("Votre page met 9 secondes à s'ouvrir sur mobile ?")
    expect(brief.pitch?.offers.map((o) => o.name)).toEqual(["Landing de conversion", "Refonte du site"])
    expect(brief.pitch?.objections).toEqual([{ objection: "C'est trop cher", answer: "Un client de plus par mois la rembourse." }])
  })

  it("counts the closer's own day: calls and who answered, meetings ahead, sales of the month", async () => {
    const { deskStats } = await import("@/features/leads/desk")
    const call = (outcome: string, at = new Date()) => ({ workspaceId: ws, leadId: id.Salon, actorId: u.closer.id, kind: "CALL" as const, data: { outcome }, occurredAt: at })
    await prisma.activity.createMany({ data: [call("reached"), call("no_answer"), call("reached", new Date(Date.now() - 3 * DAY)), { ...call("reached"), actorId: u.owner.id }] })
    await prisma.meeting.create({ data: { workspaceId: ws, leadId: id.Salon, hostId: u.closer.id, startsAt: new Date(Date.now() + DAY), endsAt: new Date(Date.now() + DAY + 1_800_000), status: "SCHEDULED", type: "DISCOVERY" } })
    await prisma.deal.create({ data: { workspaceId: ws, leadId: id.Garage, ownerId: u.closer.id, stage: "WON", wonAt: new Date() } })
    expect(await deskStats(u.closer)).toEqual({ calls: 2, reached: 1, goal: 40, meetings: 1, wonThisMonth: 1 })
  })

  it("keeps the full fiche for the others, and the script for those who use the AI", async () => {
    expect((await leads.getLead(u.owner, id.Salon)).layout).toBe("full")
    const viewer = (await leads.getLead(u.viewer, id.Salon)).brief
    expect(viewer.pitch).toBeNull()
    expect(viewer.audited).toBe(true)
    // Nothing prepared yet: no reason, no script, the site still told.
    const bare = (await leads.getLead(u.closer, id.Plomberie)).brief
    expect(bare).toMatchObject({ site: "none", audited: false, reasons: [], pitch: null })
  })
})
