// E25 Stratège and sourcing. Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/strategy.integration.test.ts
// The models and the Extractor are fakes: nothing leaves the machine.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { tool } from "ai"
import { Experimental_DecisionMockModelV4, MockLanguageModelV4 } from "ai/test"
import { z } from "zod"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const usage = (input: number, output: number) => ({ inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: output, text: output, reasoning: 0 } })

suite("Stratège and sourcing (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let catalog: typeof import("@/features/ai/catalog")
  let handlers: typeof import("@/features/ai/handlers")
  let runner: typeof import("@/worker/runner")
  let strategy: typeof import("@/features/strategy/handler")
  let strategySvc: typeof import("@/features/strategy/service")
  let qualifier: typeof import("@/features/relevance/handler")
  let relevance: typeof import("@/features/relevance/service")
  let leads: typeof import("@/features/leads/service")
  let leadSchemas: typeof import("@/features/leads/schemas")
  let PRICES: typeof import("@/lib/ai/pricing").DEFAULT_PRICES
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let calls: { tools: string[]; prompt: string }[] = []
  let answer: Record<string, unknown> = {}
  let decided: string[] = []

  /** First step: the agent reads; second: its proposal. */
  const textModel = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const prompt = JSON.stringify(options.prompt)
      calls.push({ tools: (options.tools ?? []).map((t) => t.name), prompt })
      if (calls.length % 2 === 1) {
        return {
          content: [
            { type: "tool-call", toolCallId: `c${calls.length}-1`, toolName: "campaign_metrics", input: "{}" },
            { type: "tool-call", toolCallId: `c${calls.length}-2`, toolName: "list_sectors", input: "{}" },
            { type: "tool-call", toolCallId: `c${calls.length}-3`, toolName: "search_prospect_base", input: JSON.stringify({ sector: "plombier", city: "Lyon" }) },
          ],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage: usage(6_000, 400),
          warnings: [],
        }
      }
      return { content: [{ type: "text", text: JSON.stringify(answer) }], finishReason: { unified: "stop", raw: undefined }, usage: usage(9_000, 1_500), warnings: [] }
    },
  })

  /** Jev: a pizzeria is no target, « Doute » is unsure, the rest are good targets. */
  const decisionModel = new Experimental_DecisionMockModelV4({
    doDecide: async (options) => {
      const state = JSON.stringify((options as { state?: unknown }).state ?? options)
      decided.push(state)
      const [choice, p] = state.includes("Pizzeria") ? ["NOT_RELEVANT", 0.95] : state.includes("Doute") ? ["MAYBE", 0.7] : ["RELEVANT", 0.9]
      const probabilities = Object.fromEntries(["RELEVANT", "MAYBE", "NOT_RELEVANT"].map((v) => [v, v === choice ? p : (1 - (p as number)) / 2]))
      return { answers: { relevance: { type: "choice", choice, probabilities } } as never, usage: { inputTokens: 700, outputTokens: 0 }, warnings: [] }
    },
  })

  const extractorTools = async () => ({
    tools: {
      list_sectors: tool({ description: "Secteurs de l'Extractor", inputSchema: z.object({}), execute: async () => ({ sectors: [{ key: "plombier", label: "Plombier" }, { key: "electricien", label: "Électricien" }] }) }),
      search_prospect_base: tool({ description: "Volume dans la base", inputSchema: z.object({ sector: z.string(), city: z.string() }), execute: async () => ({ total: 312 }) }),
    },
    close: async () => undefined,
  })

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
    strategy = await import("@/features/strategy/handler")
    strategySvc = await import("@/features/strategy/service")
    qualifier = await import("@/features/relevance/handler")
    relevance = await import("@/features/relevance/service")
    leads = await import("@/features/leads/service")
    leadSchemas = await import("@/features/leads/schemas")
    PRICES = (await import("@/lib/ai/pricing")).DEFAULT_PRICES
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  afterEach(() => {
    delete process.env.AI_GATEWAY_API_KEY
  })

  beforeEach(async () => {
    await resetDatabase(prisma)
    handlers.clearAgentHandlers()
    handlers.registerAgentHandler("strategist", (job) => strategy.runStrategist(job, { languageModel: () => textModel, prices: PRICES, extractorTools, sectorKeys: async () => new Set(["plombier", "electricien"]) }))
    handlers.registerAgentHandler("qualifier", (job) => qualifier.runQualifier(job, { decisionModel: () => decisionModel, prices: PRICES }))
    calls = []
    decided = []
    for (const [key, role] of [["owner", "OWNER"], ["sdr", "SDR"], ["sdr2", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@team.test`, name: `${key} Test`, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: `${key} Test`, email: x.email!, image: null, role }
    }
    await catalog.ensureAgentCatalog(ws)
    await prisma.offer.updateMany({ where: { workspaceId: ws, slug: { in: ["refonte-site", "seo-local"] } }, data: { status: "ACTIVE" } })
    answer = {
      summary: "Les plombiers répondent deux fois plus que la moyenne ; l'électricité reste à tester.",
      targets: [
        {
          sector: "Plombiers-chauffagistes",
          sectorKey: "plombier",
          zones: ["Lyon", "Villeurbanne"],
          pains: ["Appels manqués pendant les chantiers"],
          offer: "refonte-site",
          angle: "Un site mobile qui fait appeler.",
          rationale: [
            { text: "Taux de réponse de 12 % sur la campagne Plombiers.", basis: "crm" },
            { text: "312 plombiers déjà dans la base de l'Extractor à Lyon.", basis: "extractor" },
          ],
          campaignName: "Plombiers Lyon — refonte mobile",
          search: { activity: "plombier", location: "Lyon, France", maxResults: 150 },
          knownCount: 312,
        },
        {
          sector: "Électriciens",
          sectorKey: "electricien",
          zones: ["Lyon"],
          pains: ["Peu d'avis Google"],
          offer: "seo-local",
          angle: "Plus d'avis, plus d'appels.",
          rationale: [{ text: "Secteur jamais essayé : à vérifier.", basis: "hypothesis" }],
          campaignName: "Électriciens Lyon",
          search: { activity: "électricien", location: "Lyon, France", maxResults: 100 },
          knownCount: null,
        },
        { sector: "Sans argument", sectorKey: null, zones: [], pains: [], offer: "seo-local", angle: "", rationale: [], campaignName: "", search: { activity: "x", location: "y", maxResults: 10 }, knownCount: null },
      ],
    }
  })

  describe("the Stratège", () => {
    it("reads the results, the offers and the Extractor, then proposes argued targets and nothing else", async () => {
      const plumbers = await prisma.campaign.create({ data: { workspaceId: ws, name: "Plombiers", sector: "Plombier", status: "ACTIVE" } })
      const company = await prisma.company.create({ data: { workspaceId: ws, name: "Plomberie Dupont", city: "Lyon", sector: "Plombier" } })
      await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, ownerId: u.sdr.id, source: "EXTRACTOR", campaignId: plumbers.id } })

      const { proposalId, runId } = await strategySvc.requestStrategy(u.sdr, { zone: "Lyon", offerSlug: "refonte-site", focus: undefined })
      await expect(strategySvc.requestStrategy(u.sdr, { zone: undefined, focus: undefined, offerSlug: undefined })).rejects.toMatchObject({ code: "conflict" })
      await drain()

      const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId }, include: { steps: { orderBy: { index: "asc" } } } })
      expect(run).toMatchObject({ status: "SUCCEEDED", agentId: "strategist", requestedById: u.sdr.id, reservedMicros: 0 })
      expect(run.costMicros).toBeGreaterThan(0)
      expect(run.output).toMatchObject({ proposalId, targets: 2, dropped: ["Sans argument : aucun argument"] })
      // It worked with its own tools and the Extractor's (read only): never one that creates or launches.
      expect(calls[0].tools.sort()).toEqual(["campaign_metrics", "list_offers", "list_sectors", "read_skill", "search_prospect_base"])
      expect(calls[0].prompt).toContain("Offre à pousser en priorité : Refonte de site.")
      const metrics = run.steps.find((s) => s.name === "campaign_metrics")!
      expect(JSON.stringify(metrics.output)).toContain("Plombiers")

      const state = await strategySvc.strategyState(u.sdr)
      const [proposal] = state.proposals
      expect(proposal.summary).toBe("Les plombiers répondent deux fois plus que la moyenne ; l'électricité reste à tester.")
      expect(proposal.sectorsFrom).toBe("extractor")
      expect(proposal.targets.map((t) => [t.rank, t.sector, t.offer.name, t.status, t.knownCount])).toEqual([
        [1, "Plombiers-chauffagistes", "Refonte de site", "PROPOSED", 312],
        [2, "Électriciens", "SEO local", "PROPOSED", null],
      ])
      expect(proposal.targets[1].rationale).toEqual([{ text: "Secteur jamais essayé : à vérifier.", basis: "hypothesis" }])
      // Nothing was created or launched by the agent.
      expect(await prisma.campaign.count()).toBe(1)
      expect(await prisma.extractionSearch.count()).toBe(0)
    })

    it("turns a target into a draft campaign, then a search, once each, by a person's click", async () => {
      await strategySvc.requestStrategy(u.sdr, { zone: undefined, focus: undefined, offerSlug: undefined })
      await drain()
      const [first, second] = (await strategySvc.strategyState(u.sdr)).proposals[0].targets

      expect(await strategySvc.actOnTarget(u.sdr, first.id, { action: "campaign" })).toBe("CAMPAIGN")
      const campaign = await prisma.campaign.findFirstOrThrow({ include: { offer: true } })
      expect(campaign).toMatchObject({ name: "Plombiers Lyon — refonte mobile", status: "DRAFT", sector: "Plombiers-chauffagistes", area: "Lyon, Villeurbanne", ownerId: u.sdr.id })
      expect(campaign.offer?.slug).toBe("refonte-site")
      expect(campaign.description).toContain("Un site mobile qui fait appeler.")
      await expect(strategySvc.actOnTarget(u.sdr, first.id, { action: "campaign" })).rejects.toMatchObject({ code: "conflict" })

      const jobs: { query: string; max_results?: number }[] = []
      const extractor = { createJob: async (spec: { query: string; max_results?: number }) => (jobs.push(spec), { job: { id: "job_test_1", status: "queued" as const, counters: {} } }) }
      const search = { activity: "plombier chauffagiste", location: "Lyon, France", maxResults: 120 }
      expect(await strategySvc.actOnTarget(u.sdr, first.id, { action: "search", search }, null, { extractor: extractor as never })).toBe("LAUNCHED")
      expect(jobs).toMatchObject([{ query: "plombier chauffagiste", max_results: 120 }])
      const launched = await prisma.extractionSearch.findFirstOrThrow()
      expect(launched).toMatchObject({ campaignId: campaign.id, createdById: u.sdr.id, extractorJobId: "job_test_1" })
      await expect(strategySvc.actOnTarget(u.sdr, first.id, { action: "search", search }, null, { extractor: extractor as never })).rejects.toMatchObject({ code: "conflict" })
      expect(jobs).toHaveLength(1)

      // A target can also go straight to its search: its campaign is created first.
      expect(await strategySvc.actOnTarget(u.sdr, second.id, { action: "dismiss" })).toBe("DISMISSED")
      await expect(strategySvc.actOnTarget(u.sdr, second.id, { action: "search", search }, null, { extractor: extractor as never })).rejects.toMatchObject({ code: "conflict" })
      expect(await prisma.auditLog.count({ where: { action: { startsWith: "strategy." } } })).toBe(3)

      // Who may: a closer reads but does not create, a reader does not even ask.
      await expect(strategySvc.actOnTarget(u.closer, first.id, { action: "dismiss" })).rejects.toMatchObject({ code: "forbidden" })
      await expect(strategySvc.requestStrategy(u.closer, { zone: undefined, focus: undefined, offerSlug: undefined })).rejects.toMatchObject({ code: "forbidden" })
      await expect(strategySvc.requestStrategy(u.viewer, { zone: undefined, focus: undefined, offerSlug: undefined })).rejects.toMatchObject({ code: "forbidden" })
    })

    it("proposes nothing without an active offer, and says why", async () => {
      await prisma.offer.updateMany({ where: { workspaceId: ws }, data: { status: "DRAFT" } })
      const { runId } = await strategySvc.requestStrategy(u.owner, { zone: undefined, focus: undefined, offerSlug: undefined })
      await drain()
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: "FAILED", error: expect.stringContaining("Aucune offre n'est active") })
      expect(calls).toHaveLength(0)
      process.env.AI_GATEWAY_API_KEY = "test-key"
      expect((await strategySvc.strategyState(u.owner)).blocked).toContain("Aucune offre")
    })
  })

  describe("Jev's sorting", () => {
    async function campaignWithFiches(n: number) {
      const offer = await prisma.offer.findFirstOrThrow({ where: { workspaceId: ws, slug: "refonte-site" } })
      const campaign = await prisma.campaign.create({ data: { workspaceId: ws, name: "Plombiers Lyon", sector: "Plombier", area: "Lyon", offerId: offer.id } })
      for (let i = 0; i < n; i++) {
        const name = i === 0 ? "Pizzeria Napoli" : i === 1 ? "Doute Services" : `Plomberie ${i}`
        const company = await prisma.company.create({ data: { workspaceId: ws, name, city: "Lyon", sector: "Plombier" } })
        const contact = await prisma.contact.create({ data: { workspaceId: ws, companyId: company.id, name: `Contact ${i}`, email: `contact${i}@private.test` } })
        await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, contactId: contact.id, ownerId: u.sdr.id, source: "EXTRACTOR", campaignId: campaign.id } })
      }
      // A fiche the SDR does not see: never judged on their behalf.
      const hidden = await prisma.company.create({ data: { workspaceId: ws, name: "Plomberie cachée", city: "Lyon" } })
      await prisma.lead.create({ data: { workspaceId: ws, companyId: hidden.id, ownerId: u.sdr2.id, source: "EXTRACTOR", campaignId: campaign.id } })
      return campaign
    }

    it("sorts a campaign's fiches in chained batches, reading the business only", async () => {
      const campaign = await campaignWithFiches(45)
      const first = await relevance.requestRelevance(u.sdr, campaign.id)
      expect(first.queued).toBe(40)
      await expect(relevance.requestRelevance(u.sdr, campaign.id)).rejects.toMatchObject({ code: "conflict" })
      await drain()

      const runs = await prisma.agentRun.findMany({ where: { agentId: "qualifier" }, orderBy: { createdAt: "asc" } })
      expect(runs.map((r) => [r.status, (r.output as { judged?: number } | null)?.judged])).toEqual([["SUCCEEDED", 40], ["SUCCEEDED", 5]])
      expect(await prisma.leadRelevance.count({ where: { campaignId: campaign.id } })).toBe(45)
      expect(decided).toHaveLength(45)
      expect(decided.join(" ")).not.toContain("private.test")
      expect(decided.join(" ")).not.toContain("Contact 3")
      expect(decided.join(" ")).not.toContain("cachée")
      // The steps keep which fiche was judged, not what Jev read.
      const step = await prisma.agentStep.findFirstOrThrow({ where: { name: "score_import" } })
      expect(JSON.stringify(step.input)).toMatch(/Fiche c/)

      const view = await relevance.relevanceView(u.sdr, campaign.id)
      expect(view.counts).toEqual({ relevant: 43, maybe: 0, notRelevant: 1, toDecide: 1, unsorted: 0 })
      expect(view.toDecide.map((i) => [i.lead.name, i.verdict])).toEqual([["Doute Services", "MAYBE"]])
      await relevance.decideRelevance(u.sdr, view.toDecide[0].id, "RELEVANT")
      const after = await relevance.relevanceView(u.sdr, campaign.id)
      expect(after.counts).toMatchObject({ relevant: 44, toDecide: 0 })

      // The fiches list filters on it.
      const list = (r: string) => leads.listLeads(u.sdr, leadSchemas.parseLeadFilters({ campaign: campaign.id, relevance: r }))
      expect((await list("relevant")).total).toBe(44)
      expect((await list("not")).rows.map((r) => r.name)).toEqual(["Pizzeria Napoli"])
      expect((await list("pending")).total).toBe(0)
      await expect(relevance.requestRelevance(u.sdr, campaign.id)).rejects.toMatchObject({ code: "conflict" })
    })

    it("starts on its own after an import, and never fails it", async () => {
      const campaign = await campaignWithFiches(3)
      await relevance.sortAfterImport(u.sdr, campaign.id)
      expect(await prisma.agentRun.count({ where: { agentId: "qualifier" } })).toBe(0)
      process.env.AI_GATEWAY_API_KEY = "test-key"
      await relevance.sortAfterImport(u.sdr, campaign.id)
      await relevance.sortAfterImport(u.sdr, campaign.id)
      expect(await prisma.agentRun.count({ where: { agentId: "qualifier" } })).toBe(1)
      // Someone without the right to use AI imports: nothing is asked for them.
      await relevance.sortAfterImport(u.viewer, campaign.id)
      expect(await prisma.agentRun.count({ where: { agentId: "qualifier" } })).toBe(1)
    })
  })
})
