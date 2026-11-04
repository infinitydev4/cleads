// E30 lot 2: the Enquêteur — web searches billed to the AI budget, decision makers confirmed with a click, the GEO
// probe, the meeting brief, its scheduling and a campaign's search. Needs a disposable PostgreSQL with the migrations
// applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/research.integration.test.ts
// The models and the searches are fakes: nothing leaves the machine and nothing is spent.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { MockLanguageModelV4 } from "ai/test"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const usage = (input: number, output: number) => ({ inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: output, text: output, reasoning: 0 } })
const li = (handle: string) => `https://www.linkedin.com/in/${handle}`

/** What the fake searches find, by step name. */
const FOUND: Record<string, { url: string; title: string; text: string; date?: string }[]> = {
  "recherche-personne": [
    { url: li("exemple-julien-roche"), title: "Julien Roche - Gérant - Plomberie Roche | LinkedIn", text: "Julien Roche. Gérant chez Plomberie Roche, Villeurbanne. Plombier chauffagiste." },
    { url: li("exemple-julien-rocher"), title: "Julien Rocher - Gérant - Rocher Toitures | LinkedIn", text: "Julien Rocher. Gérant chez Rocher Toitures, Lyon." },
    { url: li("exemple-claire-moreau"), title: "Claire Moreau - Responsable marketing - Plomberie Roche | LinkedIn", text: "Claire Moreau. Responsable marketing chez Plomberie Roche, Villeurbanne." },
  ],
  "recherche-reseaux": [
    { url: "https://www.instagram.com/exemple.plomberie.roche/", title: "Plomberie Roche (@exemple.plomberie.roche) • Instagram", text: "Plomberie Roche. Plombier à Villeurbanne. plomberie-roche.example" },
    { url: "https://www.instagram.com/p/EXEMPLE1/", title: "Publication", text: "Plomberie Roche, chantier du jour" },
  ],
  "sonde-geo": [
    { url: "https://annuaire.example/plombiers-villeurbanne", title: "Les meilleurs plombiers de Villeurbanne", text: "Lyon Eau Services, Dépannage Express, Plomberie Duval." },
    { url: "https://concurrent.example/", title: "Lyon Eau Services", text: "Plombier à Villeurbanne depuis 1998." },
  ],
  "recherche-entreprise": [
    { url: "https://presse.example/roche-showroom", title: "Plomberie Roche ouvre un showroom", text: "La Plomberie Roche ouvre un showroom de salles de bains à Villeurbanne.", date: "2026-10-02" },
    { url: "https://avis.example/plomberie-roche", title: "Avis Plomberie Roche", text: "4,8 sur 5 : réactifs, propres, devis clairs." },
  ],
  "recherche-actualite": [{ url: "https://journal.example/artisans-villeurbanne", title: "Les artisans de Villeurbanne recrutent", text: "Plomberie Roche cherche deux apprentis pour 2027.", date: "2026-09-20" }],
}

suite("the Enquêteur (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let catalog: typeof import("@/features/ai/catalog")
  let handlers: typeof import("@/features/ai/handlers")
  let runner: typeof import("@/worker/runner")
  let runs: typeof import("@/features/ai/runs")
  let calls: typeof import("@/features/ai/calls")
  let search: typeof import("@/lib/ai/search")
  let research: typeof import("@/features/research/handler")
  let svc: typeof import("@/features/research/service")
  let schedule: typeof import("@/features/research/schedule")
  let evidence: typeof import("@/features/research/evidence")
  let PRICES: typeof import("@/lib/ai/pricing").DEFAULT_PRICES
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let prompts: { system: string; prompt: string }[] = []
  let searches: string[] = []

  /** One fake model for every role: it judges profiles, writes briefs, or runs a search the way the Gateway does. */
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const text = JSON.stringify(options.prompt)
      prompts.push({ system: String((options.prompt[0] as { content?: unknown })?.content ?? ""), prompt: text })
      if (text.includes("Tu vérifies des résultats")) {
        // R1 Julien Roche, R2 Julien Rocher (a homonym the model wrongly believes), R3 Claire Moreau; S1 the account.
        const answer = {
          people: [
            { result: 1, target: 1, name: "Julien Roche", title: "Gérant", match: "yes", confidence: 0.93, evidence: "Gérant chez Plomberie Roche, Villeurbanne" },
            { result: 2, target: 1, name: "Julien Rocher", title: "Gérant", match: "yes", confidence: 0.9, evidence: "Gérant chez Rocher Toitures" },
            { result: 3, target: 2, name: "Claire Moreau", title: "Responsable marketing", match: "unsure", confidence: 0.7, evidence: "Responsable marketing chez Plomberie Roche" },
          ],
          accounts: [{ result: 1, match: "yes", confidence: 0.92, evidence: "Plombier à Villeurbanne" }],
        }
        return { content: [{ type: "text", text: JSON.stringify(answer) }], finishReason: { unified: "stop", raw: undefined }, usage: usage(2_500, 400), warnings: [] }
      }
      if (text.includes("Rédige le brief")) {
        const brief = {
          who: [
            { text: "Plombier chauffagiste à Villeurbanne.", sources: ["CRM"], date: null },
            { text: "Clients très satisfaits (4,8 sur 5).", sources: ["W2"], date: null },
            { text: "Fondée en 1950 par le grand-père.", sources: ["W9"], date: null },
          ],
          news: [{ text: "Ouvre un showroom de salles de bains.", sources: ["W1"], date: "2026-10-02" }, { text: "Recrute deux apprentis.", sources: ["W3"], date: "2026-09-20" }],
          market: [{ text: "Concurrence de plateformes de dépannage.", sources: ["CRM"], date: null }],
          angles: [{ title: "Faire venir au showroom", offer: "seo-local", why: "Le showroom vient d'ouvrir (W1).", sources: ["W1"] }],
          questions: ["Comment vos clients vous trouvent-ils ?", "Qu'attendez-vous du showroom ?"],
        }
        return { content: [{ type: "text", text: JSON.stringify(brief) }], finishReason: { unified: "stop", raw: undefined }, usage: usage(9_000, 1_800), warnings: [] }
      }
      // A search: the Gateway runs it inside the call and gives its results back with the answer.
      const query = text.match(/Requête : \\"([^\\]+)\\"/)?.[1] ?? "requête"
      searches.push(query)
      return {
        content: [
          { type: "tool-call", toolCallId: "s1", toolName: "exa_search", input: JSON.stringify({ query }), providerExecuted: true },
          { type: "tool-result", toolCallId: "s1", toolName: "exa_search", result: { requestId: "r1", results: [{ id: "1", title: "Julien Roche - Gérant - Plomberie Roche", url: li("exemple-julien-roche"), highlights: ["Gérant chez Plomberie Roche"] }] } },
          { type: "text", text: "fait" },
        ],
        finishReason: { unified: "stop", raw: undefined },
        usage: usage(3_200, 20),
        warnings: [],
      }
    },
  })

  const frozenSearch: import("@/features/research/search").WebSearcher = async (_ctx, req) => {
    searches.push(`${req.name}:${JSON.stringify(req.query)}`)
    return { sources: (FOUND[req.name] ?? []).map((r) => ({ tool: req.tool, url: r.url, title: r.title, text: `${r.title} … ${r.text}`, date: r.date ?? null })), ran: true, error: null }
  }
  const deps = () => ({ languageModel: () => model, prices: PRICES, search: frozenSearch, now: () => new Date() })

  const worker = () => new runner.AgentWorker({ id: "w1", version: "test", concurrency: 2, perAgent: {}, pollIdleMs: 50, pollBusyMs: 10, maintenanceMs: 60_000, beatMs: 60_000, heartbeatMs: 40 }, { publish: async () => undefined })
  async function drain() {
    const w = worker()
    while ((await w.tick()) > 0) await w.idle()
    await w.idle()
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    catalog = await import("@/features/ai/catalog")
    handlers = await import("@/features/ai/handlers")
    runner = await import("@/worker/runner")
    runs = await import("@/features/ai/runs")
    calls = await import("@/features/ai/calls")
    search = await import("@/lib/ai/search")
    research = await import("@/features/research/handler")
    svc = await import("@/features/research/service")
    schedule = await import("@/features/research/schedule")
    evidence = await import("@/features/research/evidence")
    PRICES = (await import("@/lib/ai/pricing")).DEFAULT_PRICES
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    handlers.clearAgentHandlers()
    handlers.registerAgentHandler("researcher", (job) => research.runResearcher(job, deps()))
    prompts = []
    searches = []
    for (const [key, role] of [["owner", "OWNER"], ["sdr", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@research.test`, name: `${key} Test`, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: `${key} Test`, email: x.email!, image: null, role }
    }
    await catalog.ensureAgentCatalog(ws)
    await prisma.offer.updateMany({ where: { workspaceId: ws, slug: { in: ["seo-local", "geo"] } }, data: { status: "ACTIVE" } })
  })

  const fiche = async (ownerId: string | null, o: { band?: string; sector?: string | null; domain?: string | null } = {}) => {
    const c = await prisma.company.create({
      data: {
        workspaceId: ws,
        name: "Plomberie Roche",
        city: "Villeurbanne",
        postalCode: "69100",
        sector: o.sector === undefined ? "Plombier" : o.sector,
        domain: o.domain === undefined ? "plomberie-roche.example" : o.domain,
        headcountBand: o.band ?? "11",
        data: { identity: { source: "annuaire", url: null, checkedAt: "2026-11-01T00:00:00Z", found: true, officers: [{ name: "Julien Roche", role: "Gérant" }], category: "PME", labels: [], legalForm: null, opposition: false } },
      },
    })
    return prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, ownerId } })
  }

  it("bills a search the Gateway ran on top of its tokens, apart in the month's usage", async () => {
    const lead = await fiche(u.sdr.id)
    const ctx = await runs.startRun(u.sdr, { agentId: "researcher", leadId: lead.id, status: "RUNNING", capMicros: 40_000 })
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })
    // A job holds what it may cost, not the agent's whole cap.
    expect(run.capMicros).toBe(40_000)
    const r = await calls.generateForRun(ctx, { role: "fast", name: "recherche", prompt: 'Requête : "Julien Roche"', maxOutputTokens: 300, search: { tools: { exa_search: search.exaPeople() }, max: 1 } }, { languageModel: () => model, prices: PRICES })
    expect(r.searches).toEqual({ exa_search: 1 })
    expect(r.sources.map((s) => s.url)).toEqual([li("exemple-julien-roche")])
    const tokens = Math.ceil(Math.round((3_200 * 0.0000001 + 20 * 0.0000005) * 0.92 * 1e9) / 1000)
    const fee = Math.ceil(Math.round(0.007 * 0.92 * 1e9) / 1000)
    expect(r.costMicros).toBe(tokens + fee)
    const step = await prisma.agentStep.findFirstOrThrow({ where: { runId: ctx.id } })
    expect(step.costMicros).toBe(tokens + fee)
    expect(step.output).toMatchObject({ searches: { exa_search: 1 }, sources: [li("exemple-julien-roche")] })
    const rows = await prisma.aiUsage.findMany({ where: { workspaceId: ws }, orderBy: { model: "asc" } })
    expect(rows.map((x) => [x.model, x.calls, x.costMicros])).toEqual([
      ["anthropic/claude-haiku-5.5", 1, tokens],
      ["exa/search", 1, fee],
    ])
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })).costMicros).toBe(tokens + fee)
  })

  it("proposes decision makers and files the company's account, without a name in the run's history", async () => {
    const lead = await fiche(u.sdr.id)
    const { runId } = await svc.requestResearch(u.sdr, lead.id, "people")
    await drain()
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId }, include: { steps: true } })
    expect(run.status).toBe("SUCCEEDED")
    expect(run.output).toMatchObject({ fiches: 1, searched: 1, people: 2, probable: 1, accounts: 1, skipped: [] })
    expect(searches).toEqual([
      'recherche-personne:"Julien Roche Gérant Plomberie Roche Villeurbanne"',
      'recherche-personne:"Responsable marketing, communication ou commercial chez Plomberie Roche Villeurbanne"',
      'recherche-reseaux:"Plomberie Roche Villeurbanne"',
    ])
    const candidates = await prisma.contactCandidate.findMany({ orderBy: { confidence: "desc" } })
    // The homonym is out: « Roche » is not « Rocher », whatever the model believed.
    expect(candidates.map((k) => [k.name, k.role, k.status, k.url])).toEqual([
      ["Julien Roche", "EXECUTIVE", "PROBABLE", li("exemple-julien-roche")],
      ["Claire Moreau", "DECISION_MAKER", "TO_CHECK", li("exemple-claire-moreau")],
    ])
    const c = await prisma.company.findFirstOrThrow({ where: { id: lead.companyId! } })
    expect(c.peopleCheckedAt).not.toBeNull()
    expect((c.data as { socials: Record<string, string> }).socials).toEqual({ instagram: "https://www.instagram.com/exemple.plomberie.roche" })
    expect((c.data as { socialsFound: Record<string, { source: string; runId: string }> }).socialsFound.instagram).toMatchObject({ source: "Exa", runId })
    // The run's history keeps counts and summaries, never the names it compared.
    expect(JSON.stringify(run.steps.map((s) => [s.input, s.output]))).not.toMatch(/Julien|Moreau/)
    expect(run.steps.find((s) => s.name === "concordance")?.input).toEqual({ private: "Comparaison des profils trouvés avec l'entreprise" })

    // Searched again on demand: decided profiles stay decided; nothing is duplicated.
    await prisma.contactCandidate.updateMany({ where: { name: "Claire Moreau" }, data: { status: "DISMISSED" } })
    await svc.requestResearch(u.sdr, lead.id, "people")
    await drain()
    expect(await prisma.contactCandidate.count()).toBe(2)
    expect((await prisma.contactCandidate.findFirstOrThrow({ where: { name: "Claire Moreau" } })).status).toBe("DISMISSED")
  })

  it("turns a profile into a contact on a click, completes a contact of the same name, and dismisses", async () => {
    const lead = await fiche(u.sdr.id)
    const officer = await prisma.contact.create({ data: { workspaceId: ws, companyId: lead.companyId, name: "Julien Roche", jobTitle: "Gérant", role: "EXECUTIVE", source: "REGISTRY" } })
    const add = (name: string, role: "EXECUTIVE" | "DECISION_MAKER", handle: string) =>
      prisma.contactCandidate.create({ data: { workspaceId: ws, companyId: lead.companyId!, role, name, title: role === "EXECUTIVE" ? "Gérant" : "Responsable marketing", url: li(handle), confidence: 0.9, evidence: "…", status: "PROBABLE" } })
    const julien = await add("Julien Roche", "EXECUTIVE", "exemple-julien-roche")
    const claire = await add("Claire Moreau", "DECISION_MAKER", "exemple-claire-moreau")
    const other = await add("Paul Dupuis", "DECISION_MAKER", "exemple-paul-dupuis")

    await expect(svc.decideCandidate(u.viewer, lead.id, claire.id, "confirm")).rejects.toMatchObject({ status: 403 })
    expect(await svc.decideCandidate(u.sdr, lead.id, julien.id, "confirm")).toEqual({ contactId: officer.id })
    expect(await prisma.contact.findUniqueOrThrow({ where: { id: officer.id } })).toMatchObject({ linkedinUrl: li("exemple-julien-roche"), jobTitle: "Gérant", source: "REGISTRY" })

    const { contactId } = await svc.decideCandidate(u.sdr, lead.id, claire.id, "confirm")
    expect(await prisma.contact.findUniqueOrThrow({ where: { id: contactId! } })).toMatchObject({ name: "Claire Moreau", role: "DECISION_MAKER", jobTitle: "Responsable marketing", linkedinUrl: li("exemple-claire-moreau"), source: "RESEARCH", email: null, legalBasis: svc.RESEARCH_LEGAL_BASIS })
    // The fiche had no contact: it takes the first one confirmed.
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).contactId).toBe(officer.id)
    await svc.decideCandidate(u.sdr, lead.id, other.id, "dismiss")
    expect(await prisma.contactCandidate.findMany({ orderBy: { name: "asc" }, select: { name: true, status: true, decidedById: true } })).toEqual([
      { name: "Claire Moreau", status: "CONFIRMED", decidedById: u.sdr.id },
      { name: "Julien Roche", status: "CONFIRMED", decidedById: u.sdr.id },
      { name: "Paul Dupuis", status: "DISMISSED", decidedById: u.sdr.id },
    ])
    await expect(svc.decideCandidate(u.sdr, lead.id, other.id, "confirm")).rejects.toMatchObject({ status: 404 })
    expect(await prisma.auditLog.count({ where: { action: { in: ["lead.candidate_confirmed", "lead.candidate_dismissed"] } } })).toBe(3)
    expect(await svc.confirmationRate(ws, new Date(Date.now() - 86_400_000))).toEqual({ confirmed: 2, dismissed: 1, rate: 2 / 3 })
  })

  it("probes the answer engines once a month, raises GEO_ABSENT, and the offers read it", async () => {
    const lead = await fiche(u.sdr.id)
    await expect(svc.requestResearch(u.sdr, (await fiche(u.sdr.id, { sector: null })).id, "geo")).rejects.toMatchObject({ status: 400 })
    await svc.requestResearch(u.sdr, lead.id, "geo")
    await drain()
    expect(searches).toEqual(['sonde-geo:["meilleur plombier à Villeurbanne","plombier Villeurbanne avis","quel plombier choisir à Villeurbanne"]'])
    const c = await prisma.company.findFirstOrThrow({ where: { id: lead.companyId! } })
    expect((c.data as { geo: { present: boolean; cited: { host: string }[] } }).geo).toMatchObject({ present: false, sources: 2 })
    expect((c.data as { geo: { cited: { host: string }[] } }).geo.cited.map((x) => x.host)).toEqual(["annuaire.example", "concurrent.example"])
    const signal = await prisma.companySignal.findFirstOrThrow({ where: { companyId: c.id } })
    expect(signal).toMatchObject({ kind: "GEO_ABSENT", source: "Perplexity (sonde GEO)" })
    expect(signal.summary).toContain("Absente des 2 sources")
    // A second probe the same month adds no second signal.
    await svc.requestResearch(u.sdr, lead.id, "geo")
    await drain()
    expect(await prisma.companySignal.count({ where: { companyId: c.id } })).toBe(1)
    const extra = await evidence.researchEvidence(c.id)
    expect(extra.signals).toEqual([{ key: "geo_absent", evidence: ["R1"] }])
    expect(extra.evidence[0]).toMatchObject({ id: "R1", kind: "source" })
  })

  it("writes a sourced brief for tomorrow's meeting, keeps only what cites a page read, and tells the closer", async () => {
    const lead = await fiche(u.closer.id)
    const startsAt = new Date(Date.now() + 24 * 3600_000)
    const meeting = await prisma.meeting.create({ data: { workspaceId: ws, hostId: u.closer.id, leadId: lead.id, startsAt, endsAt: new Date(startsAt.getTime() + 1800_000), type: "DISCOVERY" } })
    await prisma.companySignal.create({ data: { workspaceId: ws, companyId: lead.companyId!, kind: "TAKEOVER", occurredAt: new Date(Date.now() - 20 * 86_400_000), summary: "Fonds repris par Plomberie Roche.", source: "BODACC", sourceUrl: "https://www.bodacc.fr/exemple", externalKey: "bodacc:X1", expiresAt: new Date(Date.now() + 60 * 86_400_000) } })
    const view = await svc.researchView(u.closer, lead.id)
    expect(view.nextMeeting).toEqual({ id: meeting.id, startsAt: startsAt.toISOString() })
    await svc.requestResearch(u.closer, lead.id, "brief", { meetingId: meeting.id })
    await drain()
    const brief = await prisma.leadBrief.findFirstOrThrow({ where: { leadId: lead.id } })
    // Two facts out: one cites a page that was never read (W9), the market one cites the fiche alone.
    expect(brief).toMatchObject({ meetingId: meeting.id, dropped: 2, createdById: u.closer.id })
    const content = brief.content as import("@/features/research/brief-schemas").BriefContent
    expect(content.who.map((w) => w.text)).toEqual(["Plombier chauffagiste à Villeurbanne.", "Clients très satisfaits (4,8 sur 5)."])
    expect(content.news.map((n) => n.sources)).toEqual([["https://presse.example/roche-showroom"], ["https://journal.example/artisans-villeurbanne"]])
    // The market fact cites the fiche only: the market needs a page.
    expect(content.market).toEqual([])
    expect(content.angles).toEqual([{ title: "Faire venir au showroom", offer: "seo-local", offerName: expect.any(String), why: "Le showroom vient d'ouvrir (W1).", sources: ["https://presse.example/roche-showroom"] }])
    expect(content.signals).toEqual([{ label: "Reprise", summary: "Fonds repris par Plomberie Roche.", occurredAt: expect.any(String), sourceUrl: "https://www.bodacc.fr/exemple" }])
    expect(content.meeting).toEqual({ startsAt: startsAt.toISOString(), type: "DISCOVERY" })
    // Numbered in the order the brief cites them.
    expect((brief.sources as { url: string }[]).map((s) => s.url)).toEqual(["https://avis.example/plomberie-roche", "https://presse.example/roche-showroom", "https://journal.example/artisans-villeurbanne"])
    // The writer read the fiche's signal and the pages, fenced as outside content.
    const writing = prompts.find((p) => p.prompt.includes("Rédige le brief"))!
    expect(writing.prompt).toContain("Fonds repris par Plomberie Roche.")
    expect(writing.prompt).toContain("contenu_externe")
    expect(await prisma.notification.findFirstOrThrow({ where: { userId: u.closer.id } })).toMatchObject({ title: "Brief prêt : Plomberie Roche" })
    // The brief's latest news is evidence the writer and the offers may cite.
    const extra = await evidence.researchEvidence(lead.companyId)
    expect(extra.signals.map((s) => s.key)).toEqual(["takeover"])
    expect(extra.evidence.map((e) => e.label)).toEqual([expect.stringContaining("reprise"), "Actualité relevée par l'Enquêteur (2026-10-02)", "Actualité relevée par l'Enquêteur (2026-09-20)"])
    expect((await svc.researchView(u.closer, lead.id)).brief).toMatchObject({ dropped: 2, meeting: { type: "DISCOVERY" } })
  })

  it("queues tomorrow's briefs and the day's GEO probes of good targets, once each", async () => {
    const now = new Date()
    const campaign = await prisma.campaign.create({ data: { workspaceId: ws, name: "Plombiers", ownerId: u.sdr.id, status: "ACTIVE" } })
    const good = await fiche(u.sdr.id)
    const startsAt = new Date(now.getTime() + 20 * 3600_000)
    await prisma.meeting.create({ data: { workspaceId: ws, hostId: u.closer.id, leadId: good.id, startsAt, endsAt: new Date(startsAt.getTime() + 1800_000) } })
    // Too soon, and too far: no brief.
    await prisma.meeting.create({ data: { workspaceId: ws, hostId: u.closer.id, leadId: (await fiche(u.sdr.id)).id, startsAt: new Date(now.getTime() + 3600_000), endsAt: new Date(now.getTime() + 5400_000) } })
    await prisma.meeting.create({ data: { workspaceId: ws, hostId: u.closer.id, leadId: (await fiche(u.sdr.id)).id, startsAt: new Date(now.getTime() + 72 * 3600_000), endsAt: new Date(now.getTime() + 73 * 3600_000) } })
    expect(await schedule.queueMeetingBriefs(now)).toBe(1)
    expect(await schedule.queueMeetingBriefs(now)).toBe(0)
    const brief = await prisma.agentRun.findFirstOrThrow({ where: { agentId: "researcher" } })
    expect(brief).toMatchObject({ requestedById: null, leadId: good.id, capMicros: 300_000, input: { job: "brief" } })

    // GEO: good targets only (Jev's verdict or a person's), with a site, a trade and a city, ten a day at most.
    await prisma.leadRelevance.create({ data: { workspaceId: ws, leadId: good.id, campaignId: campaign.id, verdict: "RELEVANT", confidence: 0.9, outcome: "AUTO", model: "jev" } })
    const noSite = await fiche(u.sdr.id, { domain: null })
    await prisma.leadRelevance.create({ data: { workspaceId: ws, leadId: noSite.id, campaignId: campaign.id, verdict: "RELEVANT", confidence: 0.9, outcome: "AUTO", model: "jev" } })
    const notKept = await fiche(u.sdr.id)
    await prisma.leadRelevance.create({ data: { workspaceId: ws, leadId: notKept.id, campaignId: campaign.id, verdict: "RELEVANT", confidence: 0.9, outcome: "AUTO", model: "jev", decision: "NOT_RELEVANT" } })
    await prisma.agentRun.updateMany({ where: { agentId: "researcher" }, data: { status: "SUCCEEDED", reservedMicros: 0 } })
    expect(await schedule.queueGeoProbes(now)).toBe(1)
    expect(await schedule.queueGeoProbes(now)).toBe(0)
    const geo = await prisma.agentRun.findFirstOrThrow({ where: { agentId: "researcher", input: { path: ["job"], equals: "geo" } } })
    expect(geo).toMatchObject({ leadId: good.id, requestedById: null, capMicros: 30_000, priority: -1 })
    expect((await prisma.company.findUniqueOrThrow({ where: { id: good.companyId! } })).geoCheckedAt).not.toBeNull()
  })

  it("quotes a campaign's search, then queues it in runs of ten for the person who asked", async () => {
    const campaign = await prisma.campaign.create({ data: { workspaceId: ws, name: "Plombiers Lyon", ownerId: u.sdr.id, status: "ACTIVE" } })
    for (let i = 0; i < 12; i++) {
      const lead = await fiche(u.sdr.id)
      await prisma.leadRelevance.create({ data: { workspaceId: ws, leadId: lead.id, campaignId: campaign.id, verdict: i === 11 ? "MAYBE" : "RELEVANT", confidence: 0.9, outcome: "AUTO", model: "jev", decision: i === 11 ? "RELEVANT" : null } })
    }
    // Not a good target, and one searched this month: left out.
    const maybe = await fiche(u.sdr.id)
    await prisma.leadRelevance.create({ data: { workspaceId: ws, leadId: maybe.id, campaignId: campaign.id, verdict: "MAYBE", confidence: 0.6, outcome: "REVIEW", model: "jev" } })
    const recent = await fiche(u.sdr.id)
    await prisma.company.update({ where: { id: recent.companyId! }, data: { peopleCheckedAt: new Date() } })
    await prisma.leadRelevance.create({ data: { workspaceId: ws, leadId: recent.id, campaignId: campaign.id, verdict: "RELEVANT", confidence: 0.9, outcome: "AUTO", model: "jev" } })

    expect(await svc.campaignPeopleQuote(u.sdr, campaign.id)).toEqual({ eligible: 12, batch: 12, typicalEur: 0.24, maxEur: 0.48 })
    await expect(svc.campaignPeopleQuote(u.viewer, campaign.id)).rejects.toMatchObject({ status: 403 })
    expect(await svc.launchCampaignPeople(u.sdr, campaign.id)).toEqual({ runs: 2, fiches: 12, refused: null })
    const queued = await prisma.agentRun.findMany({ where: { agentId: "researcher" }, orderBy: { capMicros: "desc" } })
    expect(queued.map((r) => [r.capMicros, (r.input as { leadIds: string[] }).leadIds.length, r.requestedById, r.campaignId])).toEqual([
      [400_000, 10, u.sdr.id, campaign.id],
      [80_000, 2, u.sdr.id, campaign.id],
    ])
    await drain()
    expect(await prisma.agentRun.count({ where: { agentId: "researcher", status: "SUCCEEDED" } })).toBe(2)
    expect(await prisma.contactCandidate.count()).toBe(24)
    expect(await prisma.notification.count({ where: { userId: u.sdr.id, title: { startsWith: "Décideurs" } } })).toBe(2)
    expect((await svc.campaignPeopleQuote(u.sdr, campaign.id)).eligible).toBe(0)
  })
})
