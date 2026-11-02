// E20 prospect audits. Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/prospect-audit.integration.test.ts
// The site, PageSpeed, the directory and the models are fakes: nothing leaves the machine.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { MockLanguageModelV4 } from "ai/test"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const HOME = `<html lang="fr"><head><title>Plomberie Martin – Plombier à Lyon</title><meta name="description" content="Plombier à Lyon : dépannage, chauffe-eau, devis gratuit sous 24 heures."></head>
<body><h1>Plombier à Lyon</h1><p>Dépannage rapide à Lyon.</p><a href="/contact">Contact</a><a href="https://www.facebook.com/pm">Facebook</a><footer>© 2016</footer></body></html>`
const CONTACT = `<html><head><title>Contact</title></head><body><a href="tel:0478999999">04 78 99 99 99</a><form></form></body></html>`
const shot = `data:image/jpeg;base64,${Buffer.from("capture-jpeg").toString("base64")}`
const psi = (perf: number) => ({
  lighthouseResult: { finalDisplayedUrl: "https://plomberie-martin.test/", categories: { performance: { score: perf }, seo: { score: 0.8 } }, audits: { viewport: { score: 1 }, "largest-contentful-paint": { numericValue: 5200 }, "final-screenshot": { details: { data: shot } } } },
})
const directory = (opposition = false) => ({
  results: [
    {
      siren: "123456789",
      nom_complet: "PLOMBERIE MARTIN",
      activite_principale: "43.22A",
      etat_administratif: "A",
      statut_diffusion: "O",
      opposition_diffusion_commerciale: opposition,
      siege: { code_postal: "69007", libelle_commune: "LYON" },
      dirigeants: [{ nom: "MARTIN", prenoms: "JEAN", qualite: "Gérant", type_dirigeant: "personne physique" }],
      complements: {},
    },
  ],
})

suite("Prospect audits (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let catalog: typeof import("@/features/ai/catalog")
  let handlers: typeof import("@/features/ai/handlers")
  let runs: typeof import("@/features/ai/runs")
  let runner: typeof import("@/worker/runner")
  let audit: typeof import("@/features/prospect-audit/handler")
  let service: typeof import("@/features/prospect-audit/service")
  let pagespeed: typeof import("@/features/prospect-audit/pagespeed")
  let annuaire: typeof import("@/features/prospect-audit/annuaire")
  let leads: typeof import("@/features/leads/service")
  let FetchRefused: typeof import("@/features/prospect-audit/net").FetchRefused
  let PRICES: typeof import("@/lib/ai/pricing").DEFAULT_PRICES
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let leadId = ""
  let twinLeadId = ""
  let seen: { step: string; files: number }[] = []
  let opposition = false
  let siteDown = false

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    catalog = await import("@/features/ai/catalog")
    handlers = await import("@/features/ai/handlers")
    runs = await import("@/features/ai/runs")
    runner = await import("@/worker/runner")
    audit = await import("@/features/prospect-audit/handler")
    service = await import("@/features/prospect-audit/service")
    pagespeed = await import("@/features/prospect-audit/pagespeed")
    annuaire = await import("@/features/prospect-audit/annuaire")
    leads = await import("@/features/leads/service")
    FetchRefused = (await import("@/features/prospect-audit/net")).FetchRefused
    PRICES = (await import("@/lib/ai/pricing")).DEFAULT_PRICES
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    handlers.clearAgentHandlers()
    seen = []
    opposition = false
    siteDown = false
    for (const [key, role] of [["owner", "OWNER"], ["sdr", "SDR"], ["sdr2", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@audit.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
    const company = (name: string) =>
      prisma.company.create({
        data: { workspaceId: ws, name, website: "https://plomberie-martin.test", domain: "plomberie-martin.test", phone: "+33 4 78 99 99 99", city: "Lyon", postalCode: "69007", sector: "Plombier", rating: 4.2, reviewCount: 8, source: "EXTRACTOR", data: { siren: "123456789", socials: {} } },
      })
    leadId = (await prisma.lead.create({ data: { workspaceId: ws, companyId: (await company("Plomberie Martin")).id, ownerId: u.sdr.id } })).id
    twinLeadId = (await prisma.lead.create({ data: { workspaceId: ws, companyId: (await company("Plomberie Martin (doublon)")).id, ownerId: null } })).id
    await catalog.ensureAgentCatalog(ws)
  })

  const fetchPage = async (target: string) => {
    if (siteDown) throw new FetchRefused("dns", "Nom de domaine introuvable")
    const pages: Record<string, string> = { "https://plomberie-martin.test/": HOME, "https://plomberie-martin.test/contact": CONTACT }
    const body = pages[target]
    return { url: target, finalUrl: target, status: body ? 200 : 404, redirects: [], contentType: "text/html", body: body ?? null, bytes: body?.length ?? 0, truncated: false, timeMs: 200 }
  }
  let psiCalls = 0
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const messages = options.prompt as { role: string; content: string | { type: string; text?: string }[] }[]
      const system = messages.filter((m) => m.role === "system").map((m) => (typeof m.content === "string" ? m.content : "")).join("\n")
      const files = messages.flatMap((m) => (typeof m.content === "string" ? [] : m.content.filter((p) => p.type === "file"))).length
      const extraction = system.includes("Tu lis les pages du site")
      seen.push({ step: extraction ? "extract" : "analyze", files })
      const text = extraction
        ? JSON.stringify({ activity: "Plombier à Lyon", services: ["Dépannage"], area: "Lyon", audience: null, headline: "Plombier à Lyon", ctas: [{ label: "Appeler", kind: "phone", page: "P2" }, { label: "Inventé", kind: "form", page: "P9" }], proofs: [], faq: false, entityClear: true, outdatedSigns: [], frictions: [] })
        : JSON.stringify({
            imageScore: 30,
            conversionScore: 45,
            findings: [{ area: "image", severity: "high", title: "Site visiblement daté", detail: "Mise en page fixe et typographies anciennes.", evidence: ["C1"] }],
            strengths: [{ text: "Numéro cliquable sur la page contact", evidence: ["P2"] }],
            frictions: [],
            opportunities: [{ text: "Refonte mobile d'abord", evidence: ["M1", "C1"] }],
            signals: [{ key: "site_outdated", evidence: ["C1"] }],
            summary: ["Site lent et daté sur mobile", "Note Google correcte mais peu d'avis", "Aucune donnée pour les moteurs IA"],
          })
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: undefined },
        usage: { inputTokens: { total: 3000, noCache: 3000, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 600, text: 600, reasoning: undefined } },
        warnings: [],
      }
    },
  })
  const deps = () =>
    ({
      fetchPage,
      pageSpeed: async (target: string, strategy: "mobile" | "desktop") => {
        psiCalls++
        return pagespeed.parsePsi(psi(strategy === "mobile" ? 0.34 : 0.62), target, strategy)
      },
      annuaire: async (query: { siren?: string | null; name: string; postalCode?: string | null }) => ({ record: annuaire.pickCompany(directory(opposition), query), error: null }),
      languageModel: () => model,
      prices: PRICES,
    }) satisfies import("@/features/prospect-audit/handler").AuditDeps

  const worker = () => new runner.AgentWorker({ id: "w1", version: "test", concurrency: 2, perAgent: {}, pollIdleMs: 50, pollBusyMs: 10, maintenanceMs: 60_000, beatMs: 60_000, heartbeatMs: 40 }, { publish: async () => undefined })

  async function auditThroughWorker(actor: U, lead = leadId) {
    handlers.registerAgentHandler("auditor", (job) => audit.runAudit(job, deps()))
    const started = await service.requestAudit(actor, lead)
    expect(started.reused).toBe(false)
    const w = worker()
    expect(await w.tick()).toBe(1)
    await w.idle()
    return started.reused ? null : started.runId
  }

  it("audits a fiche through the worker: facts, model reading, evidence, screenshots, officers", async () => {
    psiCalls = 0
    const runId = (await auditThroughWorker(u.sdr))!
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })
    expect(run).toMatchObject({ status: "SUCCEEDED", agentId: "auditor", reservedMicros: 0 })
    expect(run.costMicros).toBeGreaterThan(0)
    const row = await prisma.prospectAudit.findUniqueOrThrow({ where: { runId }, include: { captures: true } })
    expect(row).toMatchObject({ status: "COMPLETE", leadId, domain: "plomberie-martin.test", url: "https://plomberie-martin.test/", costMicros: run.costMicros })
    expect(row.captures.map((c) => c.kind).sort()).toEqual(["desktop", "mobile"])
    expect(Buffer.from(row.captures[0].data).toString()).toBe("capture-jpeg")
    expect(row.validUntil.getTime() - row.createdAt.getTime()).toBeGreaterThan(29 * 86_400_000)
    expect(psiCalls).toBe(2)
    // The analysis saw both screenshots; the extraction saw none.
    expect(seen).toEqual([
      { step: "extract", files: 0 },
      { step: "analyze", files: 2 },
    ])
    const steps = await prisma.agentStep.findMany({ where: { runId }, orderBy: { index: "asc" }, select: { type: true, name: true } })
    expect(steps.map((s) => s.name)).toEqual(["fetch_page", "detect_stack", "pagespeed", "dirigeants", "extract_site", "analyze_audit", "save_audit"])
    // Officers' names stay in the audit, not in the run's history.
    expect(JSON.stringify(await prisma.agentStep.findMany({ where: { runId } }))).not.toContain("Jean Martin")

    const view = await service.getLeadAudit(u.sdr, leadId)
    const a = view.audit!
    expect(a.summary).toEqual(["Site lent et daté sur mobile", "Note Google correcte mais peu d'avis", "Aucune donnée pour les moteurs IA"])
    expect(a.scores.image).toBe(30)
    expect(a.measured).toBe(8)
    expect(a.score).toBeLessThan(70)
    expect(a.potential?.level).not.toBe("low")
    const ids = new Set(a.report.evidence.map((e) => e.id))
    for (const f of a.report.findings) expect(f.evidence.every((id) => ids.has(id)), f.title).toBe(true)
    expect(a.report.findings.map((f) => f.title)).toEqual(expect.arrayContaining(["Site visiblement daté", "Seulement 8 avis Google"]))
    expect(a.report.signals.map((s) => s.key)).toEqual(expect.arrayContaining(["site_outdated", "few_reviews", "no_google_ads_high_intent", "mobile_score_low"]))
    expect(a.people).toEqual([expect.objectContaining({ name: "Jean Martin", role: "Gérant", added: false })])
    expect(view).toMatchObject({ run: null, canRun: true })

    // The fiche's score shows the audit's reading, without changing its rules.
    const lead = await leads.getLead(u.sdr, leadId)
    expect(lead.aiReason).toMatchObject({ label: `Audit IA : ${a.potential!.label.toLowerCase()} (${a.score}/100)`, confidence: 1 })
    expect(lead.can.audit).toBe(true)

    // Run again for the same run (a retry): the saved audit is returned, nothing new is written.
    const again = await audit.runAudit({ run: await runs.loadRunContext(runId), attempt: 2, input: {}, approved: [], signal: new AbortController().signal }, deps())
    expect(again.output.auditId).toBe(row.id)
    expect(await prisma.prospectAudit.count()).toBe(1)
  })

  it("is reused for 30 days by every fiche of the domain, unless asked again", async () => {
    await auditThroughWorker(u.sdr)
    const reused = await service.requestAudit(u.sdr2, twinLeadId)
    expect(reused).toMatchObject({ reused: true })
    expect((await service.getLeadAudit(u.sdr2, twinLeadId)).audit).toMatchObject({ shared: true })
    const forced = await service.requestAudit(u.sdr, leadId, { force: true })
    expect(forced).toMatchObject({ reused: false })
    await expect(service.requestAudit(u.sdr, leadId, { force: true })).rejects.toMatchObject({ status: 409 })
  })

  it("follows who may see, start and enrich an audit", async () => {
    await auditThroughWorker(u.sdr)
    await expect(service.getLeadAudit(u.sdr2, leadId)).rejects.toMatchObject({ status: 404 })
    expect(await service.getLeadAudit(u.viewer, leadId)).toMatchObject({ canRun: false })
    await expect(service.requestAudit(u.viewer, leadId)).rejects.toMatchObject({ status: 403 })
    await expect(service.requestAudit(u.closer, leadId)).rejects.toMatchObject({ status: 404 })

    const a = (await service.getLeadAudit(u.sdr, leadId)).audit!
    expect(Buffer.from((await service.auditCapture(u.sdr, a.id, "mobile", leadId)).data).toString()).toBe("capture-jpeg")
    expect(Buffer.from((await service.auditCapture(u.sdr2, a.id, "desktop", twinLeadId)).data).toString()).toBe("capture-jpeg")
    await expect(service.auditCapture(u.sdr2, a.id, "mobile", leadId)).rejects.toMatchObject({ status: 404 })

    await expect(service.addProposedContact(u.viewer, leadId, a.id, 0)).rejects.toMatchObject({ status: 403 })
    const added = await service.addProposedContact(u.sdr, leadId, a.id, 0)
    expect(added.linked).toBe(true)
    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: added.contactId } })
    expect(contact).toMatchObject({ name: "Jean Martin", jobTitle: "Gérant", email: null, legalBasis: expect.stringMatching(/Intérêt légitime/), collectedFrom: expect.stringMatching(/Annuaire des entreprises/) })
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).contactId).toBe(contact.id)
    await expect(service.addProposedContact(u.sdr, leadId, a.id, 0)).rejects.toMatchObject({ status: 409 })
    expect((await service.getLeadAudit(u.sdr, leadId)).audit!.people[0].added).toBe(true)
    expect(await prisma.auditLog.count({ where: { action: "lead.contact_added_from_audit" } })).toBe(1)
  })

  it("proposes no officer when the company objects to commercial use", async () => {
    opposition = true
    await auditThroughWorker(u.sdr)
    const a = (await service.getLeadAudit(u.sdr, leadId)).audit!
    expect(a.people).toEqual([])
    expect(a.report.registry?.opposition).toBe(true)
    expect(a.report.notes.join(" ")).toMatch(/s'oppose à l'usage commercial/)
  })

  it("gives an explicit partial audit when the site cannot be reached", async () => {
    siteDown = true
    psiCalls = 0
    const runId = (await auditThroughWorker(u.sdr))!
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("SUCCEEDED")
    const a = (await service.getLeadAudit(u.sdr, leadId)).audit!
    expect(a.status).toBe("PARTIAL")
    expect(psiCalls).toBe(0)
    expect(a.report.findings[0]).toMatchObject({ title: "Site injoignable", severity: "high" })
    expect(a.report.signals.map((s) => s.key)).toContain("site_unreachable")
    expect(a.report.notes.join(" ")).toMatch(/partiel/)
    expect(a.captures).toEqual([])
    // Without a readable site there is no page to extract: the model reads the measured facts only.
    expect(seen).toEqual([{ step: "analyze", files: 0 }])
  })
})
