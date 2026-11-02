// E21 offers and pitch. Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/offer-pitch.integration.test.ts
// The model is a fake: nothing leaves the machine.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { MockLanguageModelV4 } from "ai/test"
import type { AuditReport } from "@/features/prospect-audit/schemas"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const REPORT: AuditReport = {
  findings: [
    { area: "vitesse", severity: "high", title: "Site lent sur mobile", detail: "34/100 sur mobile selon PageSpeed.", evidence: ["M1"], origin: "measure" },
    { area: "seoLocal", severity: "medium", title: "Seulement 8 avis Google", detail: "Les concurrents de la zone en ont davantage.", evidence: ["S1"], origin: "measure" },
  ],
  strengths: [],
  frictions: [],
  opportunities: [{ text: "Refonte mobile d'abord", evidence: ["M1", "C1"] }],
  signals: [
    { key: "mobile_score_low", evidence: ["M1"] },
    { key: "site_outdated", evidence: ["C1"] },
    { key: "few_reviews", evidence: ["S1"] },
    { key: "no_google_ads_high_intent", evidence: ["P1"] },
    // A draft offer answers it: it must never be suggested.
    { key: "weak_cta", evidence: ["P1"] },
  ],
  evidence: [
    { id: "P1", kind: "page", label: "Accueil", value: "Plomberie Martin – Plombier à Lyon", url: "https://plomberie-martin.test/" },
    { id: "M1", kind: "measure", label: "Performance mobile (PageSpeed)", value: "34/100", url: "https://pagespeed.web.dev/report" },
    { id: "S1", kind: "source", label: "Fiche Google (Extractor)", value: "4,2/5, 8 avis", url: null },
    { id: "C1", kind: "capture", label: "Capture mobile (PageSpeed)", value: "mobile", url: null },
  ],
  people: [{ name: "Jean Martin", role: "Gérant", source: "Annuaire des entreprises", legalBasis: "Intérêt légitime", collectedAt: "2026-11-02T10:00:00.000Z" }],
  registry: null,
  site: { reachable: true, pages: ["https://plomberie-martin.test/"], cms: null, blockedByRobots: false },
  notes: [],
  models: { extraction: null, analysis: null },
}

const recommendation = (offer: string, role: string, fit: number, evidence: string[]) => ({ offer, role, fit, why: `Pourquoi ${offer}, d'après l'audit.`, gain: `Ce que ${offer} apporte.`, evidence, objection: { objection: "C'est trop cher.", answer: "On commence petit." } })
const PITCH = {
  headline: "Site lent et daté sur mobile, et seulement 8 avis : des demandes perdues chaque semaine.",
  recommendations: [
    recommendation("refonte-site", "main", 88, ["M1", "C1", "X7"]),
    recommendation("seo-local", "complement", 74, ["S1"]),
    // Cites nothing that exists: dropped.
    recommendation("google-ads", "entry", 60, ["Z9"]),
    recommendation("cleads-growth", "later", 40, ["S1", "M1"]),
  ],
  script: {
    opening: "Bonjour, je suis Léa, de Cleads.",
    hook: { text: "Saviez-vous que votre site obtient 34/100 sur mobile ?", evidence: ["M1"] },
    questions: ["D'où viennent vos clients ?", "Qu'avez-vous déjà essayé ?"],
    proposal: "Une refonte pensée pour le mobile, puis la fiche Google.",
    close: "Je vous propose un rendez-vous jeudi à 10 h.",
  },
  objections: [{ objection: "Je n'ai pas le temps.", answer: "Une heure au démarrage suffit." }],
  email: { subject: "Votre site sur mobile", angle: "34/100 sur mobile : vos visiteurs repartent avant d'appeler.", evidence: ["M1"] },
}
const ACTIVE = ["refonte-site", "seo-local", "google-ads", "cleads-growth", "geo"]

suite("Offers and pitch (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let catalog: typeof import("@/features/ai/catalog")
  let handlers: typeof import("@/features/ai/handlers")
  let runs: typeof import("@/features/ai/runs")
  let runner: typeof import("@/worker/runner")
  let pitch: typeof import("@/features/offer-pitch/handler")
  let service: typeof import("@/features/offer-pitch/service")
  let offersService: typeof import("@/features/offers/service")
  let leads: typeof import("@/features/leads/service")
  let labels: typeof import("@/features/offer-pitch/labels")
  let PRICES: typeof import("@/lib/ai/pricing").DEFAULT_PRICES
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let leadId = ""
  let bareLeadId = ""
  let companyId = ""
  let calls: { system: string; prompt: string; maxOutputTokens?: number }[] = []
  let answer: unknown = PITCH
  // A raw answer and how it ended, to play an answer cut at its length limit.
  let raw: { text: string; finish: "stop" | "length" } | null = null
  let duringCall: (() => Promise<void>) | null = null

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    catalog = await import("@/features/ai/catalog")
    handlers = await import("@/features/ai/handlers")
    runs = await import("@/features/ai/runs")
    runner = await import("@/worker/runner")
    pitch = await import("@/features/offer-pitch/handler")
    service = await import("@/features/offer-pitch/service")
    offersService = await import("@/features/offers/service")
    leads = await import("@/features/leads/service")
    labels = await import("@/features/offer-pitch/labels")
    PRICES = (await import("@/lib/ai/pricing")).DEFAULT_PRICES
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  const createAudit = (at = new Date()) =>
    prisma.prospectAudit.create({
      data: {
        workspaceId: ws,
        leadId,
        companyId,
        domain: "plomberie-martin.test",
        url: "https://plomberie-martin.test/",
        status: "COMPLETE",
        scores: { technique: 70, vitesse: 34, mobile: 40, seoLocal: 45, geo: 30, conversion: 50, presence: 30, image: 25 },
        score: 41,
        summary: ["Site lent sur mobile", "Peu d'avis Google", "Aucune donnée pour les moteurs IA"],
        report: REPORT,
        validUntil: new Date(at.getTime() + 30 * 86_400_000),
        createdAt: at,
      },
    })

  beforeEach(async () => {
    await resetDatabase(prisma)
    handlers.clearAgentHandlers()
    calls = []
    answer = PITCH
    raw = null
    duringCall = null
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["sdr2", "SDR"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@pitch.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
    const company = await prisma.company.create({ data: { workspaceId: ws, name: "Plomberie Martin", website: "https://plomberie-martin.test", domain: "plomberie-martin.test", city: "Lyon", sector: "Plombier" } })
    companyId = company.id
    leadId = (await prisma.lead.create({ data: { workspaceId: ws, companyId, ownerId: u.sdr.id } })).id
    const bare = await prisma.company.create({ data: { workspaceId: ws, name: "Sans audit", domain: "sans-audit.test" } })
    bareLeadId = (await prisma.lead.create({ data: { workspaceId: ws, companyId: bare.id, ownerId: u.sdr.id } })).id
    await catalog.ensureAgentCatalog(ws)
    await prisma.offer.updateMany({ where: { workspaceId: ws, slug: { in: ACTIVE } }, data: { status: "ACTIVE" } })
    await createAudit()
    handlers.registerAgentHandler("offers", (job) => pitch.runOfferPitch(job, deps()))
  })

  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const messages = options.prompt as { role: string; content: string | { type: string; text?: string }[] }[]
      const text = (role: string) => messages.filter((m) => m.role === role).map((m) => (typeof m.content === "string" ? m.content : m.content.map((p) => p.text ?? "").join(""))).join("\n")
      calls.push({ system: text("system"), prompt: text("user"), maxOutputTokens: options.maxOutputTokens })
      await duringCall?.()
      return {
        content: [{ type: "text", text: raw ? raw.text : JSON.stringify(answer) }],
        finishReason: { unified: raw?.finish ?? "stop", raw: undefined },
        usage: { inputTokens: { total: 4000, noCache: 4000, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 900, text: 900, reasoning: undefined } },
        warnings: [],
      }
    },
  })
  const deps = () => ({ languageModel: () => model, prices: PRICES })
  const worker = () => new runner.AgentWorker({ id: "w1", version: "test", concurrency: 2, perAgent: {}, pollIdleMs: 50, pollBusyMs: 10, maintenanceMs: 60_000, beatMs: 60_000, heartbeatMs: 40 }, { publish: async () => undefined })

  async function pitchThroughWorker(actor: U = u.sdr) {
    const { runId } = await service.requestPitch(actor, leadId)
    const w = worker()
    expect(await w.tick()).toBe(1)
    await w.idle()
    return runId
  }

  it("prepares a pitch through the worker: candidate offers only, each argued with evidence, budget from the catalogue", async () => {
    const before = await service.getLeadPitch(u.sdr, leadId)
    expect(before).toMatchObject({ pitch: null, activeOffers: 5, canRun: true, canDecide: true })
    // Rules first: the draft landing offer answers "weak_cta" but is not active; GEO is active but not called for.
    expect(before.candidates.map((c) => c.slug)).toEqual(["refonte-site", "seo-local", "google-ads", "cleads-growth"])

    const runId = await pitchThroughWorker()
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })
    expect(run).toMatchObject({ status: "SUCCEEDED", agentId: "offers", reservedMicros: 0 })
    expect(run.costMicros).toBeGreaterThan(0)
    expect(run.output).toMatchObject({ recommendations: 3 })
    const steps = await prisma.agentStep.findMany({ where: { runId }, orderBy: { index: "asc" }, select: { name: true } })
    expect(steps.map((s) => s.name)).toEqual(["get_audit", "list_offers", "compose_pitch", "save_recommendations"])

    // What the advisor was given: its expert role, the active catalogue, the call script and the plumbers' playbook,
    // and room enough to reason, then write the whole pitch.
    expect(calls).toHaveLength(1)
    expect(calls[0].maxOutputTokens).toBe(6_000)
    expect(calls[0].system).toContain("directeur conseil")
    expect(calls[0].system).toContain("# Offres Cleads")
    expect(calls[0].system).toContain("Script d'appel de 15 minutes")
    expect(calls[0].system).toMatch(/playbook-artisans-batiment/)
    expect(calls[0].system).not.toContain("Landing de conversion")
    expect(calls[0].prompt).toContain("`refonte-site`")
    expect(calls[0].prompt).not.toContain("`landing-conversion`")
    expect(calls[0].prompt).not.toContain("`geo`")
    expect(calls[0].prompt).not.toContain("Jean Martin")

    const view = (await service.getLeadPitch(u.sdr, leadId)).pitch!
    expect(view.stale).toBe(false)
    expect(view.recommendations.map((r) => [r.rank, r.offer.slug, r.role, r.status])).toEqual([
      [1, "refonte-site", "MAIN", "SUGGESTED"],
      [2, "seo-local", "COMPLEMENT", "SUGGESTED"],
      [3, "cleads-growth", "LATER", "SUGGESTED"],
    ])
    const known = new Set(REPORT.evidence.map((e) => e.id))
    for (const r of view.recommendations) expect(r.evidence.length > 0 && r.evidence.every((id) => known.has(id)), r.offer.slug).toBe(true)
    expect(view.recommendations[0]).toMatchObject({ evidence: ["M1", "C1"], offer: { name: "Refonte de site", active: true }, signals: [{ key: "site_outdated", label: "Site daté" }, { key: "mobile_score_low", label: "Site lent ou non adapté au téléphone" }] })
    expect(view.pack).toEqual({ names: ["Refonte de site", "SEO local"], budget: labels.packBudget([{ priceMinEur: 2000, priceMaxEur: 6000, billing: "ONE_OFF" }, { priceMinEur: 300, priceMaxEur: 800, billing: "MONTHLY" }]) })
    expect(view.notes).toEqual([expect.stringMatching(/« Google Ads » retirée/)])
    expect(view.evidence.map((e) => e.id).sort()).toEqual(["C1", "M1", "S1"])
    expect(view.script.hook).toEqual({ text: "Saviez-vous que votre site obtient 34/100 sur mobile ?", evidence: ["M1"] })
    expect(view.email).toMatchObject({ subject: "Votre site sur mobile", evidence: ["M1"] })
    expect(view.costEur).toBe(run.costMicros / 1_000_000)

    // The fiche counts the pitch's offers for its tab.
    expect((await leads.getLead(u.sdr, leadId)).pitch).toMatchObject({ offers: 3 })
    expect(await leads.getLead(u.viewer, leadId)).toMatchObject({ pitch: null, can: { offers: false } })

    // Run again for the same run (a retry): the saved pitch is returned, nothing new is written.
    const again = await pitch.runOfferPitch({ run: await runs.loadRunContext(runId), attempt: 2, input: run.input, approved: [], signal: new AbortController().signal }, deps())
    expect(again.output.pitchId).toBe(view.id)
    expect(await prisma.offerPitch.count()).toBe(1)
    expect(calls).toHaveLength(1)
  })

  it("refuses before spending anything when there is nothing to argue, or no right to", async () => {
    await expect(service.requestPitch(u.sdr, bareLeadId)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/pas encore d’audit/) })
    await expect(service.requestPitch(u.viewer, leadId)).rejects.toMatchObject({ status: 403 })
    await expect(service.getLeadPitch(u.viewer, leadId)).rejects.toMatchObject({ status: 403 })
    await expect(service.requestPitch(u.sdr2, leadId)).rejects.toMatchObject({ status: 404 })
    // A manager may see the fiche and work on it.
    expect(await service.getLeadPitch(u.manager, leadId)).toMatchObject({ canRun: true, canManageOffers: true })

    await prisma.offer.updateMany({ where: { workspaceId: ws, slug: { in: ["refonte-site", "seo-local", "google-ads", "cleads-growth"] } }, data: { status: "DRAFT" } })
    await expect(service.requestPitch(u.sdr, leadId)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/ne répond aux signaux/) })
    expect(await service.getLeadPitch(u.sdr, leadId)).toMatchObject({ candidates: [], activeOffers: 1 })
    await prisma.offer.updateMany({ where: { workspaceId: ws }, data: { status: "DRAFT" } })
    await expect(service.requestPitch(u.sdr, leadId)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Aucune offre n’est active/) })
    expect(await prisma.agentRun.count()).toBe(0)
  })

  it("keeps each person's decision, with the reason of a refusal, to measure relevance", async () => {
    await pitchThroughWorker()
    const [main, complement, later] = (await service.getLeadPitch(u.sdr, leadId)).pitch!.recommendations
    const kept = await service.decideRecommendation(u.sdr, leadId, main.id, { status: "ACCEPTED" })
    expect(kept).toMatchObject({ status: "ACCEPTED", decidedBy: "sdr", reason: null })
    const refused = await service.decideRecommendation(u.sdr, leadId, complement.id, { status: "REJECTED", reason: "TOO_EXPENSIVE", note: "Budget serré cette année" })
    expect(refused).toMatchObject({ status: "REJECTED", reason: "TOO_EXPENSIVE", note: "Budget serré cette année" })
    await expect(service.decideRecommendation(u.sdr, leadId, later.id, { status: "REJECTED" })).rejects.toMatchObject({ status: 400 })
    await expect(service.decideRecommendation(u.viewer, leadId, later.id, { status: "ACCEPTED" })).rejects.toMatchObject({ status: 403 })
    await expect(service.decideRecommendation(u.sdr2, leadId, later.id, { status: "ACCEPTED" })).rejects.toMatchObject({ status: 404 })
    await expect(service.decideRecommendation(u.sdr, bareLeadId, later.id, { status: "ACCEPTED" })).rejects.toMatchObject({ status: 404 })

    // Undoing clears who decided, and why.
    const undone = await service.decideRecommendation(u.sdr, leadId, complement.id, { status: "SUGGESTED" })
    expect(undone).toMatchObject({ status: "SUGGESTED", reason: null, note: null, decidedBy: null, decidedAt: null })

    // An offer gone from the catalogue can be set aside, not kept.
    await prisma.offer.updateMany({ where: { workspaceId: ws, slug: "cleads-growth" }, data: { status: "ARCHIVED" } })
    expect((await service.getLeadPitch(u.sdr, leadId)).pitch!.recommendations[2].offer.active).toBe(false)
    await expect(service.decideRecommendation(u.sdr, leadId, later.id, { status: "ACCEPTED" })).rejects.toMatchObject({ status: 409 })
    expect(await service.decideRecommendation(u.sdr, leadId, later.id, { status: "REJECTED", reason: "BAD_TIMING" })).toMatchObject({ status: "REJECTED" })

    const actions = (await prisma.auditLog.findMany({ where: { action: { startsWith: "offer.recommendation_" } }, orderBy: { createdAt: "asc" }, select: { action: true } })).map((a) => a.action)
    expect(actions).toEqual(["offer.recommendation_accepted", "offer.recommendation_rejected", "offer.recommendation_reset", "offer.recommendation_rejected"])
    // The catalogue shows what closers made of each offer.
    const catalogue = await offersService.listOffers(u.owner)
    expect(catalogue.find((o) => o.slug === "refonte-site")?.stats).toEqual({ suggested: 1, accepted: 1, rejected: 0 })
    expect(catalogue.find((o) => o.slug === "seo-local")?.stats).toEqual({ suggested: 1, accepted: 0, rejected: 0 })
    expect(catalogue.find((o) => o.slug === "geo")?.stats).toEqual({ suggested: 0, accepted: 0, rejected: 0 })
  })

  it("drops an offer taken off the catalogue while the advisor was writing, and says so", async () => {
    duringCall = async () => {
      await prisma.offer.updateMany({ where: { workspaceId: ws, slug: "refonte-site" }, data: { status: "DRAFT" } })
    }
    await pitchThroughWorker()
    const view = (await service.getLeadPitch(u.sdr, leadId)).pitch!
    // The main offer went: the next one takes its place, the pack keeps a main offer.
    expect(view.recommendations.map((r) => [r.offer.slug, r.role])).toEqual([
      ["seo-local", "MAIN"],
      ["cleads-growth", "LATER"],
    ])
    expect(view.notes.join(" ")).toMatch(/« Refonte de site » retirée : elle n’est plus active/)

    // When none is left, the run ends with a plain reason and nothing is saved.
    duringCall = async () => {
      await prisma.offer.updateMany({ where: { workspaceId: ws }, data: { status: "DRAFT" } })
    }
    await prisma.offer.updateMany({ where: { workspaceId: ws, slug: { in: ACTIVE } }, data: { status: "ACTIVE" } })
    const runId = await pitchThroughWorker()
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })
    expect(run).toMatchObject({ status: "FAILED", reservedMicros: 0 })
    expect(run.error).toMatch(/retirées du catalogue/)
    expect(await prisma.offerPitch.count()).toBe(1)
    expect((await service.getLeadPitch(u.sdr, leadId)).lastFailure).toMatchObject({ runId, error: run.error })
  })

  it("stops at once, bills it and says why, when the answer is cut off at its length limit", async () => {
    raw = { text: JSON.stringify(PITCH).slice(0, 900), finish: "length" }
    const runId = await pitchThroughWorker()
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })
    // No second try: it would be cut the same way. What the model wrote is billed all the same.
    expect(run).toMatchObject({ status: "FAILED", attempts: 1, reservedMicros: 0 })
    expect(run.costMicros).toBeGreaterThan(0)
    expect(run.error).toMatch(/coupée avant la fin/)
    expect(await prisma.offerPitch.count()).toBe(0)
    expect((await service.getLeadPitch(u.sdr, leadId)).lastFailure).toMatchObject({ runId, error: run.error })
  })

  it("tries again when no offer cites real evidence", async () => {
    answer = { ...PITCH, recommendations: PITCH.recommendations.map((r) => ({ ...r, evidence: ["Z9"] })) }
    const runId = await pitchThroughWorker()
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })
    expect(run).toMatchObject({ status: "QUEUED", attempts: 1 })
    expect(run.error).toMatch(/n’a relié aucune offre à une preuve/)
    expect(await prisma.offerPitch.count()).toBe(0)
  })

  it("marks a pitch made on an older audit", async () => {
    await pitchThroughWorker()
    expect((await service.getLeadPitch(u.sdr, leadId)).pitch!.stale).toBe(false)
    await createAudit(new Date(Date.now() + 1_000))
    const state = await service.getLeadPitch(u.sdr, leadId)
    expect(state.pitch!.stale).toBe(true)
    expect(state.audit!.id).not.toBe(state.pitch!.auditId)
  })
})
