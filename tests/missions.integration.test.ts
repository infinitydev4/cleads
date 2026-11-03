// E28 missions (lot 2). Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/missions.integration.test.ts
// The models and Cleads Extractor are fakes (the Extractor is a small HTTP server in this process): nothing leaves the
// machine.
import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { simulateReadableStream } from "ai"
import { Experimental_DecisionMockModelV4, MockLanguageModelV4 } from "ai/test"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

/** French numbers and amounts use narrow no-break spaces: compared as plain spaces. */
const flat = (text: string) => text.replace(/[\u00a0\u202f]/g, " ")
const usage = (input: number, output: number) => ({ inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: output, text: output, reasoning: 0 } })

/** A fake Extractor: a job runs until `finish()`, then gives `size` reachable businesses, all different. */
function fakeExtractor() {
  const jobs = new Map<string, { status: string; query: string; n: number; no: number }>()
  const created: { query: string; max_results?: number }[] = []
  const cancelled: string[] = []
  let count = 0
  const job = (id: string) => {
    const j = jobs.get(id)!
    return { id, status: j.status, counters: j.status === "completed" ? { raw_found: j.n, unique: j.n, complete: j.n, crm_useful: j.n } : { unique: 0 } }
  }
  const server = http.createServer((req, res) => {
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      const path = new URL(req.url ?? "/", "http://x").pathname
      const send = (value: unknown, status = 200) => {
        res.writeHead(status, { "content-type": "application/json" })
        res.end(JSON.stringify(value))
      }
      if (req.method === "GET" && path === "/v1/health/summary") return send({ status: "ok", summary: "Tout va bien", sources: [] })
      if (req.method === "POST" && path === "/v1/jobs") {
        const spec = JSON.parse(body) as { query: string; max_results?: number }
        created.push(spec)
        const id = `job_${++count}`
        jobs.set(id, { status: "running", query: spec.query, n: Math.min(spec.max_results ?? 100, fake.size), no: count })
        return send({ job: job(id) })
      }
      const m = path.match(/^\/v1\/jobs\/([^/]+)(\/businesses)?$/)
      if (!m || !jobs.has(m[1])) return send({ error: "not found" }, 404)
      const j = jobs.get(m[1])!
      if (req.method === "DELETE") {
        j.status = "cancelled"
        cancelled.push(m[1])
        return send({ job: job(m[1]) })
      }
      if (m[2]) {
        const slug = j.query.normalize("NFD").replace(/[^a-z]/gi, "").toLowerCase()
        const items = Array.from({ length: j.n }, (_, i) => ({
          id: j.no * 1_000 + i,
          dedup_key: `${m[1]}-${i}`,
          name: `${j.query} ${i} (démo)`,
          category: j.query,
          city: "Nantes",
          country: "FR",
          phone: `+33 2 40 ${String(j.no).padStart(2, "0")} ${String(i).padStart(2, "0")} 00`,
          website: `https://${slug}-${j.no}-${i}.test`,
          emails: [`contact@${slug}-${j.no}-${i}.test`],
          completeness: 80,
        }))
        return send({ items, has_more: false })
      }
      return send({ job: job(m[1]) })
    })
  })
  const fake = {
    size: 30,
    jobs,
    created,
    cancelled,
    server,
    finish: () => {
      for (const j of jobs.values()) if (j.status === "running") j.status = "completed"
    },
  }
  return fake
}

suite("Missions (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let catalog: typeof import("@/features/ai/catalog")
  let handlers: typeof import("@/features/ai/handlers")
  let runner: typeof import("@/worker/runner")
  let strategy: typeof import("@/features/strategy/handler")
  let qualifier: typeof import("@/features/relevance/handler")
  let missions: typeof import("@/features/missions/service")
  let engine: typeof import("@/features/missions/engine")
  let plan: typeof import("@/features/missions/plan")
  let task: typeof import("@/features/missions/task")
  let approvals: typeof import("@/features/ai/approvals")
  let definitions: typeof import("@/features/ai/definitions")
  let search: typeof import("@/features/search/service")
  let sequences: typeof import("@/features/outreach/sequences")
  let copilot: typeof import("@/features/copilot/turn")
  let conversations: typeof import("@/features/copilot/conversations")
  let PRICES: typeof import("@/lib/ai/pricing").DEFAULT_PRICES
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  const fake = fakeExtractor()
  let policy: import("@/features/ai/actions/policy").AgentPolicy

  /** The Stratège: two targets on the first request. */
  let strategistCalls = 0
  const textModel = new MockLanguageModelV4({
    doGenerate: async () => {
      strategistCalls++
      const answer = {
        summary: "Deux secteurs à tester à Nantes.",
        targets: [
          { sector: "Boulangeries", sectorKey: null, zones: ["Nantes"], pains: ["Pas de site"], offer: "refonte-site", angle: "Un site qui fait venir.", rationale: [{ text: "Secteur jamais essayé : à vérifier.", basis: "hypothesis" }], campaignName: "Boulangeries Nantes", search: { activity: "boulangerie", location: "Nantes, France", maxResults: 150 }, knownCount: null },
          { sector: "Fleuristes", sectorKey: null, zones: ["Nantes"], pains: ["Peu d'avis"], offer: "refonte-site", angle: "Plus de commandes en ligne.", rationale: [{ text: "Secteur jamais essayé : à vérifier.", basis: "hypothesis" }], campaignName: "Fleuristes Nantes", search: { activity: "fleuriste", location: "Nantes, France", maxResults: 150 }, knownCount: null },
        ],
      }
      return { content: [{ type: "text", text: JSON.stringify(answer) }], finishReason: { unified: "stop", raw: undefined }, usage: usage(8_000, 1_000), warnings: [] }
    },
  })

  /** Jev: business n° i is a good target when i % 3 = 0, possible when 1, none when 2. */
  const decisionModel = new Experimental_DecisionMockModelV4({
    doDecide: async (options) => {
      const state = JSON.stringify((options as { state?: unknown }).state ?? options)
      const i = Number(state.match(/ (\d+) \(démo\)/)?.[1] ?? 0)
      const choice = ["RELEVANT", "MAYBE", "NOT_RELEVANT"][i % 3]
      const probabilities = Object.fromEntries(["RELEVANT", "MAYBE", "NOT_RELEVANT"].map((v) => [v, v === choice ? 0.9 : 0.05]))
      return { answers: { relevance: { type: "choice", choice, probabilities } } as never, usage: { inputTokens: 600, outputTokens: 0 }, warnings: [] }
    },
  })

  const worker = () =>
    new runner.AgentWorker({ id: "w1", version: "test", concurrency: 2, perAgent: {}, pollIdleMs: 50, pollBusyMs: 10, maintenanceMs: 60_000, beatMs: 60_000, heartbeatMs: 40, missionConcurrency: 1 }, { publish: async () => undefined })

  /** Passes of the missions and the runs they start, until nothing moves: the engine's minute is skipped. */
  async function work(rounds = 12) {
    const w = worker()
    for (let i = 0; i < rounds; i++) {
      await prisma.agentMission.updateMany({ where: { status: "RUNNING" }, data: { wakeAt: new Date(Date.now() - 1_000) } })
      await prisma.agentMissionStep.updateMany({ where: { status: "PENDING", notBefore: { not: null } }, data: { notBefore: null } })
      const passes = await w.tickMissions()
      await w.idle()
      let runs = 0
      while ((await w.tick()) > 0) {
        runs++
        await w.idle()
      }
      await w.idle()
      if (!passes && !runs) break
    }
  }
  const launch = async (user: U, raw: unknown, capEur?: number) => {
    const { mission } = await missions.proposeMission(user, policy, raw)
    await missions.actOnMission(user, mission.id, { action: "approve", ...(capEur ? { capEur } : {}) })
    return mission.id
  }
  const state = (id: string) => prisma.agentMission.findUniqueOrThrow({ where: { id }, include: { steps: { orderBy: [{ key: "asc" }, { item: "asc" }] } } })
  const rejection = async (p: Promise<unknown>) => {
    try {
      await p
    } catch (e) {
      return e as { code: string; status: number; message: string; extra?: Record<string, unknown> }
    }
    throw new Error("expected a refusal")
  }

  beforeAll(async () => {
    await new Promise<void>((resolve) => fake.server.listen(0, "127.0.0.1", resolve))
    process.env.DATABASE_URL = url
    process.env.EXTRACTOR_URL = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`
    process.env.EXTRACTOR_API_KEY = "crm-mission-test-key-0123456789"
    delete process.env.EXTRACTOR_WEBHOOK_SECRET
    prisma = (await import("@/lib/prisma")).prisma
    catalog = await import("@/features/ai/catalog")
    handlers = await import("@/features/ai/handlers")
    runner = await import("@/worker/runner")
    strategy = await import("@/features/strategy/handler")
    qualifier = await import("@/features/relevance/handler")
    missions = await import("@/features/missions/service")
    engine = await import("@/features/missions/engine")
    plan = await import("@/features/missions/plan")
    task = await import("@/features/missions/task")
    approvals = await import("@/features/ai/approvals")
    definitions = await import("@/features/ai/definitions")
    search = await import("@/features/search/service")
    sequences = await import("@/features/outreach/sequences")
    copilot = await import("@/features/copilot/turn")
    conversations = await import("@/features/copilot/conversations")
    PRICES = (await import("@/lib/ai/pricing")).DEFAULT_PRICES
  })
  afterAll(async () => {
    fake.server.close()
    await prisma.$disconnect()
  })
  afterEach(() => {
    delete process.env.AI_GATEWAY_API_KEY
  })

  beforeEach(async () => {
    await resetDatabase(prisma)
    // Jev sorts an import on its own only when the AI is configured; the models stay the fakes above.
    process.env.AI_GATEWAY_API_KEY = "test-key"
    search.resetHealthCache()
    fake.jobs.clear()
    fake.created.length = 0
    fake.cancelled.length = 0
    fake.size = 30
    strategistCalls = 0
    handlers.clearAgentHandlers()
    handlers.registerAgentHandler("strategist", (job) => strategy.runStrategist(job, { languageModel: () => textModel, prices: PRICES, extractorTools: async () => ({ tools: {}, close: async () => undefined }), sectorKeys: async () => new Set<string>() }))
    handlers.registerAgentHandler("qualifier", (job) => qualifier.runQualifier(job, { decisionModel: () => decisionModel, prices: PRICES }))
    task.registerMissionTools()
    handlers.registerTaskHandler(task.MISSION_ACTION, (job) => task.runMissionAction(job))
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@team.test`, name: `${key} Test`, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: `${key} Test`, email: x.email!, image: null, role }
    }
    await catalog.ensureAgentCatalog(ws)
    await prisma.offer.updateMany({ where: { workspaceId: ws, slug: { in: ["refonte-site", "seo-local"] } }, data: { status: "ACTIVE" } })
    policy = (await definitions.effectiveAgent(ws, "copilot")).policy
  })

  const architects = {
    title: "Architectes Nantes",
    steps: [
      { id: "s1", action: "create_campaign", input: { name: "Architectes Nantes", sector: "Architecte", area: "Nantes", offerSlug: "refonte-site" } },
      { id: "s2", action: "start_search", input: { activity: "architecte", location: "Nantes, France", maxResults: 1000, campaignId: { $ref: "s1.campaignId" } } },
      { id: "s3", action: "import_search", input: { searchId: { $ref: "s2.searchId" } } },
      { id: "s4", action: "sort_campaign", input: { campaignId: { $ref: "s1.campaignId" } } },
    ],
  }

  describe("checking a plan", () => {
    it("says each step in words, with what it cites, and what it may cost", async () => {
      const check = await plan.checkPlan(u.owner, policy, architects)
      expect(check.plan.steps.map((s) => flat(s.text))).toEqual([
        "Créer la campagne « Architectes Nantes » (Architecte, Nantes, offre « Refonte de site »), en brouillon",
        "Rechercher « architecte — Nantes, France » sur l'Extractor (1 000 entreprises au plus, avec les emails), pour la campagne de l'étape 1",
        "Importer les entreprises joignables de la recherche de l'étape 2, sans doublon",
        "Faire trier par Jev les fiches de la campagne de l'étape 1 : bonne cible, possible ou hors cible",
      ])
      expect(check.plan.steps.map((s) => s.level)).toEqual(["confirm", "confirm", "confirm", "confirm"])
      expect(check.volume).toMatchObject({ searches: 1, results: 1_000 })
      // Jev sorts a thousand fiches at most, by 40, at its cap of 0,05 € a batch; probably 60 % of them.
      expect(check.maxMicros).toBe(25 * 50_000)
      expect(check.probableMicros).toBe(15 * 10_000)
    })

    it("follows a loop over the Stratège's targets, item by item", async () => {
      const check = await plan.checkPlan(u.owner, policy, {
        title: "Sites à Nantes",
        steps: [
          { id: "s1", action: "propose_targets", input: { zone: "Nantes", offerSlug: "refonte-site" } },
          { id: "s2", action: "act_on_target", input: { targetId: { $ref: "item" }, action: "search", maxResults: 100 }, forEach: "s1.targetIds" },
          { id: "s3", action: "import_search", input: { searchId: { $ref: "s2.searchId" } }, forEach: "s2" },
          { id: "s4", action: "sort_campaign", input: { campaignId: { $ref: "s2.campaignId" } }, forEach: "s2" },
          { id: "s5", action: "select_leads", input: { limit: 100 } },
        ],
      })
      expect(check.plan.steps.map((s) => flat(s.text))).toEqual([
        "Demander au Stratège 2 à 4 secteurs à prospecter à Nantes pour l'offre « Refonte de site »",
        "Pour chaque cible de l'étape 1 : créer la campagne de la cible et lancer sa recherche (100 entreprises au plus)",
        "Pour chaque cible : importer les entreprises joignables de sa recherche, sans doublon",
        "Pour chaque cible : faire trier par Jev les fiches de sa campagne : bonne cible, possible ou hors cible",
        "Retenir les 100 meilleures fiches jugées bonnes cibles par Jev, parmi les fiches importées par la mission",
      ])
      // Four targets at most: four searches of 100, the Stratège once, Jev on 400 fiches.
      expect(check.volume).toMatchObject({ searches: 4, results: 400 })
      expect(check.runs).toEqual({ strategist: 1, qualifier: 10 })
      expect(check.maxMicros).toBe(300_000 + 10 * 50_000)
      // A literal loop says its first item, then the others.
      const literal = await plan.checkPlan(u.owner, policy, { title: "Artisans", steps: [{ id: "s1", action: "start_search", input: { activity: { $ref: "item" }, location: "Nantes, France", maxResults: 200 }, forEach: ["plombier", "électricien"] }] })
      expect(literal.plan.steps[0].text).toBe("Rechercher « plombier — Nantes, France » sur l'Extractor (200 entreprises au plus, avec les emails), puis de même pour « électricien »")
    })

    it("refuses what cannot run, saying which step and why", async () => {
      const bad = async (steps: unknown[], user = u.owner, p = policy) => (await rejection(plan.checkPlan(user, p, { title: "Essai", steps }))).message
      expect(await bad([{ id: "s1", action: "delete_lead", input: {} }])).toMatch(/s1 \(delete_lead\) : ce n'est pas une action de mission/)
      expect(await bad([{ id: "s2", action: "list_campaigns", input: {} }])).toMatch(/s1 attendue, s2 trouvée/)
      expect(await bad([{ id: "s1", action: "import_search", input: { searchId: { $ref: "s2.searchId" } } }])).toMatch(/ne la précède pas/)
      expect(await bad([architects.steps[0], { id: "s2", action: "import_search", input: { searchId: { $ref: "s1.searchId" } } }])).toMatch(/s1 \(create_campaign\) ne donne pas « searchId » ; elle donne : campaignId/)
      expect(await bad([{ id: "s1", action: "start_search", input: { activity: { $ref: "item" }, location: "Nantes" } }])).toMatch(/n'a de sens que dans une boucle/)
      // Twenty audits at most: an import's thousand fiches must be narrowed first.
      expect(await bad([...architects.steps.slice(0, 3), { id: "s4", action: "start_audit", input: { leadId: { $ref: "item" } }, forEach: "s3.leadIds" }])).toMatch(/20 au plus.*select_leads/)
      // A sequence takes 100 fiches at most.
      expect(await bad([{ id: "s1", action: "select_leads", input: { limit: 150 } }, { id: "s2", action: "enroll_in_sequence", input: { sequenceId: "seq_x", leadIds: { $ref: "s1.leadIds" } } }])).toMatch(/s2 \(enroll_in_sequence\) : leadIds/)
      // Bounds of a mission.
      expect(flat(await bad([{ id: "s1", action: "start_search", input: { activity: { $ref: "item" }, location: "Nantes, France", maxResults: 1000 }, forEach: ["plombier", "maçon", "couvreur", "peintre"] }]))).toMatch(/3 000 entreprises au plus/)
      expect(await bad([{ id: "s1", action: "sort_campaign", input: { campaignId: "introuvable" } }])).toMatch(/campagne introuvable/)
      // The person's rights, and the copilot's matrix.
      expect(await bad(architects.steps.slice(0, 2), u.closer)).toMatch(/s1 \(create_campaign\).*droit/)
      expect(await bad(architects.steps, u.owner, { ...policy, prospecting: "off" })).toMatch(/s2 \(start_search\).*« Prospection »/)
    })
  })

  describe("« Recherche 1 000 architectes à Nantes »", () => {
    it("runs in one click, waits for the search, imports, has Jev sort everything, then tags and reports", async () => {
      const { mission } = await missions.proposeMission(u.owner, policy, architects, { conversationId: null })
      expect(mission).toMatchObject({ status: "PROPOSED", capMicros: 2_000_000, maxMicros: 1_250_000 })
      // Proposing launched nothing.
      expect(await prisma.campaign.count()).toBe(0)
      // Only the person who asked launches it.
      expect((await rejection(missions.actOnMission(u.manager, mission.id, { action: "approve" }))).code).toBe("forbidden")
      await missions.actOnMission(u.owner, mission.id, { action: "approve" })

      await work()
      let m = await state(mission.id)
      expect(m.status).toBe("RUNNING")
      expect(m.steps.map((s) => [s.key, s.status])).toEqual([
        ["s1", "DONE"],
        ["s2", "WAITING"],
      ])
      expect(fake.created).toMatchObject([{ query: "architecte", max_results: 1000 }])
      const view = await missions.missionView(u.owner, mission.id)
      expect(view.steps[1]).toMatchObject({ state: "waiting", detail: "« architecte — Nantes, France » sur l'Extractor : 0 trouvées, 0 joignables" })

      fake.finish()
      await work()
      m = await state(mission.id)
      expect(m.status).toBe("SUCCEEDED")
      expect(m.steps.map((s) => [s.key, s.status])).toEqual([
        ["s1", "DONE"],
        ["s2", "DONE"],
        ["s3", "DONE"],
        ["s4", "DONE"],
      ])
      const campaign = await prisma.campaign.findFirstOrThrow({ where: { name: "Architectes Nantes" } })
      const imported = await prisma.lead.findMany({ where: { campaignId: campaign.id } })
      expect(imported).toHaveLength(30)
      // Jev sorted them all, for the mission, and its cost counts against the mission's cap.
      expect(await prisma.leadRelevance.count({ where: { campaignId: campaign.id } })).toBe(30)
      const runs = await prisma.agentRun.findMany({ where: { agentId: "qualifier" } })
      expect(runs.length).toBeGreaterThan(0)
      expect(runs.every((r) => r.missionId === mission.id)).toBe(true)
      expect(await engine.missionSpend(mission.id)).toBeGreaterThan(0)

      // The report: one line per step, and the fiches tagged for the filtered list.
      const tag = engine.missionTag("Architectes Nantes")
      expect(tag).toBe("mission-architectes-nantes")
      expect(m.report).toMatchObject({ leads: 30, tag, listUrl: `/app/leads?tag=${encodeURIComponent(tag)}`, campaigns: [{ id: campaign.id, name: "Architectes Nantes" }] })
      expect((m.report as { lines: string[] }).lines).toEqual([
        "1. Campagne « Architectes Nantes » créée",
        "2. « architecte — Nantes, France » : 30 entreprises trouvées, 30 joignables",
        "3. 30 fiches nouvelles, 0 déjà connue",
        "4. Jev : 10 bonnes cibles, 10 possibles, 10 hors cible",
      ])
      expect(await prisma.lead.count({ where: { tags: { has: tag } } })).toBe(30)
      // The person stays the author, via the copilot and this mission.
      const created = await prisma.auditLog.findFirstOrThrow({ where: { action: "campaign.created" } })
      expect(created).toMatchObject({ actorId: u.owner.id, metadata: { via: { agentId: "copilot", missionId: mission.id } } })
      expect(await prisma.notification.findFirst({ where: { userId: u.owner.id, title: "Mission terminée" } })).toMatchObject({ message: expect.stringContaining("30 fiches") })
    })
  })

  describe("« 100 entreprises à Nantes susceptibles d'acheter un site »", () => {
    it("lets the Stratège choose the sectors, searches and sorts each one, then keeps the best", async () => {
      const id = await launch(u.owner, {
        title: "Sites à Nantes",
        steps: [
          { id: "s1", action: "propose_targets", input: { zone: "Nantes", offerSlug: "refonte-site" } },
          { id: "s2", action: "act_on_target", input: { targetId: { $ref: "item" }, action: "search", maxResults: 100 }, forEach: "s1.targetIds" },
          { id: "s3", action: "import_search", input: { searchId: { $ref: "s2.searchId" } }, forEach: "s2" },
          { id: "s4", action: "sort_campaign", input: { campaignId: { $ref: "s2.campaignId" } }, forEach: "s2" },
          { id: "s5", action: "select_leads", input: { limit: 15 } },
        ],
      })
      await work()
      expect(strategistCalls).toBe(1)
      let m = await state(id)
      expect(m.steps.filter((s) => s.key === "s2").map((s) => s.status)).toEqual(["WAITING", "WAITING"])
      expect(fake.created.map((c) => c.query).sort()).toEqual(["boulangerie", "fleuriste"])
      fake.finish()
      await work()
      m = await state(id)
      expect(m.status).toBe("SUCCEEDED")
      expect(await prisma.campaign.count()).toBe(2)
      // Ten good targets per sector: the fifteen best are kept and tagged.
      expect(m.report).toMatchObject({ leads: 15 })
      const tag = (m.report as { tag: string }).tag
      const kept = await prisma.lead.findMany({ where: { tags: { has: tag } }, include: { relevances: true } })
      expect(kept).toHaveLength(15)
      expect(kept.every((l) => l.relevances[0]?.verdict === "RELEVANT")).toBe(true)
      expect((m.report as { lines: string[] }).lines.at(-1)).toBe("5. 15 fiches retenues sur 60 fiches")
    })
  })

  describe("what contacts a prospect", () => {
    async function setup() {
      const campaign = await prisma.campaign.create({ data: { workspaceId: ws, name: "Plombiers", status: "ACTIVE" } })
      for (let i = 0; i < 3; i++) {
        const c = await prisma.company.create({ data: { workspaceId: ws, name: `Plomberie ${i} (démo)`, city: "Nantes" } })
        const k = await prisma.contact.create({ data: { workspaceId: ws, companyId: c.id, name: "Jean Dupont", email: `jean${i}@plomberie${i}.test`, emailKind: "NOMINATIVE" } })
        await prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, contactId: k.id, ownerId: u.owner.id, status: "NEW", source: "EXTRACTOR", campaignId: campaign.id } })
      }
      // An active mailbox, written as is: no server is reached in these tests.
      await prisma.mailbox.create({ data: { workspaceId: ws, ownerId: u.owner.id, address: "marie@trycleads.test", displayName: "Marie Martin", smtpHost: "smtp.trycleads.test", smtpPort: 465, smtpSecure: true, username: "marie@trycleads.test", secret: "sealed", dailyCap: 30, warmupStartedAt: new Date(Date.now() - 60 * 86_400_000) } })
      const seq = await sequences.createSequence(u.owner, { name: "Relance plombiers", steps: [{ delayDays: 0, subject: "Une question", body: "Bonjour {{prenom|Madame, Monsieur}}." }] })
      return {
        title: "Relancer les plombiers",
        steps: [
          { id: "s1", action: "select_leads", input: { campaignId: campaign.id, verdict: "any", limit: 3, hasEmail: true } },
          { id: "s2", action: "enroll_in_sequence", input: { sequenceId: seq.id, leadIds: { $ref: "s1.leadIds" } } },
        ],
      }
    }

    it("waits for its own click, given from the mission's card, then enrols", async () => {
      const raw = await setup()
      const check = await plan.checkPlan(u.owner, policy, raw)
      expect(check.plan.steps[1]).toMatchObject({ level: "explicit", text: "Inscrire les fiches retenues de l'étape 1 dans la séquence « Relance plombiers »" })
      const id = await launch(u.owner, raw)
      await work()
      const m = await state(id)
      expect(m.status).toBe("RUNNING")
      expect(m.steps.find((s) => s.key === "s2")).toMatchObject({ status: "WAITING", waitKind: "run" })
      expect(await prisma.sequenceEnrollment.count()).toBe(0)
      const view = await missions.missionView(u.owner, id)
      expect(view.steps[1]).toMatchObject({ state: "approval", detail: "Attend votre validation" })
      const approval = await prisma.agentApproval.findUniqueOrThrow({ where: { id: view.steps[1].approvalId! } })
      expect(approval.summary).toMatch(/^Inscrire dans la séquence « Relance plombiers » \(1 email\) 3 fiches/)
      expect(await prisma.notification.findFirst({ where: { userId: u.owner.id, title: "Mission : votre validation" } })).not.toBeNull()

      await approvals.decideApproval(u.owner, approval.id, { approve: true })
      await work()
      const done = await state(id)
      expect(done.status).toBe("SUCCEEDED")
      expect(done.steps.find((s) => s.key === "s2")).toMatchObject({ status: "DONE", output: expect.objectContaining({ line: "3 fiches inscrites" }) })
      expect(await prisma.sequenceEnrollment.count()).toBe(3)
      const runs = await prisma.agentRun.findMany({ where: { missionId: id } })
      expect(runs).toMatchObject([{ agentId: "copilot", status: "SUCCEEDED", capMicros: 0 }])
    })

    it("goes on without it when the click is refused", async () => {
      const id = await launch(u.owner, await setup())
      await work()
      const approvalId = (await missions.missionView(u.owner, id)).steps[1].approvalId!
      await approvals.decideApproval(u.owner, approvalId, { approve: false })
      await work()
      const m = await state(id)
      expect(m.status).toBe("SUCCEEDED")
      expect(m.steps.find((s) => s.key === "s2")).toMatchObject({ status: "SKIPPED", output: expect.objectContaining({ line: "Refusée : rien n'a été fait." }) })
      expect(await prisma.sequenceEnrollment.count()).toBe(0)
      // The selection is still tagged: it is the last step that gave fiches.
      expect(m.report).toMatchObject({ leads: 3 })
    })
  })

  describe("the cap of a mission (D32)", () => {
    it("asks a second confirmation above it, pauses at it, and goes on once raised", async () => {
      await prisma.aiSetting.update({ where: { workspaceId: ws }, data: { missionCapMicros: 200_000 } })
      const raw = { title: "Cibles", steps: [{ id: "s1", action: "propose_targets", input: { zone: "Nantes" } }] }
      const { mission } = await missions.proposeMission(u.owner, policy, raw)
      const refused = await rejection(missions.actOnMission(u.owner, mission.id, { action: "approve" }))
      expect(refused).toMatchObject({ code: "conflict", extra: { capEur: 0.5 } })
      expect(flat(refused.message)).toMatch(/jusqu'à 0,30 €, au-delà du plafond de 0,20 €/)
      await missions.actOnMission(u.owner, mission.id, { action: "approve", capEur: 0.5 })
      expect((await state(mission.id)).capMicros).toBe(500_000)

      // A cap lowered under the next step's: the mission pauses before spending.
      await prisma.agentMission.update({ where: { id: mission.id }, data: { capMicros: 100_000 } })
      await work()
      let m = await state(mission.id)
      expect(m).toMatchObject({ status: "PAUSED", pauseKind: "budget" })
      expect(m.steps).toMatchObject([{ status: "PENDING", attempts: 0 }])
      expect(await prisma.agentRun.count()).toBe(0)
      expect((await rejection(missions.actOnMission(u.owner, mission.id, { action: "resume" }))).code).toBe("conflict")
      await missions.actOnMission(u.owner, mission.id, { action: "resume", capEur: 1 })
      await work()
      m = await state(mission.id)
      expect(m.status).toBe("SUCCEEDED")
      expect(m.capMicros).toBe(1_000_000)
    })
  })

  describe("recurring missions (D35)", () => {
    it("starts each pass with the rights of its day, and pauses after two that could not run", async () => {
      const campaign = await prisma.campaign.create({ data: { workspaceId: ws, name: "Suivi", status: "ACTIVE" } })
      for (let i = 0; i < 2; i++) {
        const c = await prisma.company.create({ data: { workspaceId: ws, name: `Fiche ${i} (démo)` } })
        await prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, ownerId: u.sdr.id, source: "EXTRACTOR", campaignId: campaign.id } })
      }
      const raw = { title: "Suivi du lundi", steps: [{ id: "s1", action: "select_leads", input: { campaignId: campaign.id, verdict: "any", limit: 5 } }], recurrence: { frequency: "weekly", days: [1], hour: 8 } }
      const check = await plan.checkPlan(u.sdr, policy, raw)
      expect(check.plan.recurrence).toEqual({ frequency: "weekly", days: [1], hour: 8 })
      const first = await launch(u.sdr, raw)
      const schedule = await prisma.agentMissionSchedule.findFirstOrThrow()
      expect(schedule).toMatchObject({ status: "ACTIVE", requestedById: u.sdr.id, failures: 0 })
      expect(schedule.nextRunAt!.getTime()).toBeGreaterThan(Date.now())
      expect((await state(first)).scheduleId).toBe(schedule.id)
      await work()
      expect((await state(first)).status).toBe("SUCCEEDED")

      // Its time comes: a new pass, which runs alone.
      await prisma.agentMissionSchedule.update({ where: { id: schedule.id }, data: { nextRunAt: new Date(Date.now() - 1_000) } })
      expect(await missions.runSchedules()).toBe(1)
      await work()
      const passes = await prisma.agentMission.findMany({ where: { scheduleId: schedule.id }, orderBy: { createdAt: "asc" } })
      expect(passes.map((p) => p.status)).toEqual(["SUCCEEDED", "SUCCEEDED"])

      // The person loses the AI: the passes cannot run, and the second miss pauses it.
      await prisma.user.update({ where: { id: u.sdr.id }, data: { role: "VIEWER" } })
      for (const expected of [1, 2]) {
        await prisma.agentMissionSchedule.update({ where: { id: schedule.id }, data: { nextRunAt: new Date(Date.now() - 1_000) } })
        expect(await missions.runSchedules()).toBe(0)
        expect((await prisma.agentMissionSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).failures).toBe(expected)
      }
      expect(await prisma.agentMissionSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).toMatchObject({ status: "PAUSED", pauseReason: expect.stringContaining("désactivé") })
      expect(await prisma.notification.findFirst({ where: { userId: u.sdr.id, title: "Mission récurrente en pause" } })).not.toBeNull()
    })

    it("keeps three recurring missions per person at most", async () => {
      const raw = { title: "Chaque jour", steps: [{ id: "s1", action: "select_leads", input: { verdict: "any", limit: 5 } }], recurrence: { frequency: "daily", hour: 9 } }
      for (let i = 0; i < 3; i++) await launch(u.owner, raw)
      const { mission } = await missions.proposeMission(u.owner, policy, raw)
      expect((await rejection(missions.actOnMission(u.owner, mission.id, { action: "approve" }))).message).toMatch(/déjà 3 missions récurrentes/)
    })
  })

  describe("following, pausing, cancelling", () => {
    it("stops the search in progress when cancelled; what is done stays", async () => {
      const id = await launch(u.owner, architects)
      await work()
      const searchId = (await state(id)).steps.find((s) => s.key === "s2")!.waitId!
      // A manager may stop it, not launch or resume it.
      await missions.actOnMission(u.manager, id, { action: "pause" })
      expect((await rejection(missions.actOnMission(u.manager, id, { action: "resume" }))).code).toBe("forbidden")
      await missions.actOnMission(u.manager, id, { action: "cancel" })
      const m = await state(id)
      expect(m.status).toBe("CANCELLED")
      expect(m.steps.map((s) => s.status)).toEqual(["DONE", "CANCELLED"])
      expect(fake.cancelled).toHaveLength(1)
      expect(await prisma.extractionSearch.findUniqueOrThrow({ where: { id: searchId } })).toMatchObject({ status: "CANCELLED" })
      expect(await prisma.campaign.count()).toBe(1)
      await work()
      expect((await state(id)).status).toBe("CANCELLED")
    })

    it("never redoes a step a stopped worker may have done without the person", async () => {
      const raw = { title: "Une campagne", steps: [{ id: "s1", action: "create_campaign", input: { name: "Toitures Nantes" } }] }
      const id = await launch(u.owner, raw)
      // A worker stopped in the middle of the step.
      await prisma.agentMissionStep.create({ data: { missionId: id, key: "s1", item: 0, action: "create_campaign", input: { name: "Toitures Nantes" }, status: "RUNNING", attempts: 1, startedAt: new Date() } })
      await work()
      let m = await state(id)
      expect(m).toMatchObject({ status: "PAUSED", pauseKind: "step", pauseReason: expect.stringContaining("a peut-être été faite") })
      expect(m.steps[0].status).toBe("UNCERTAIN")
      expect(await prisma.campaign.count()).toBe(0)
      await missions.actOnMission(u.owner, id, { action: "resume" })
      await work()
      m = await state(id)
      expect(m.status).toBe("SUCCEEDED")
      expect(await prisma.campaign.count()).toBe(1)
    })

    it("pauses when the person loses a right on the way, and tells the managers", async () => {
      const id = await launch(u.sdr, architects)
      await prisma.user.update({ where: { id: u.sdr.id }, data: { active: false } })
      await work()
      expect(await state(id)).toMatchObject({ status: "PAUSED", pauseKind: "rights" })
      expect(await prisma.notification.count({ where: { userId: { in: [u.owner.id, u.manager.id] }, title: "Mission en pause" } })).toBe(2)
      expect(await prisma.campaign.count()).toBe(0)
    })

    it("shows each person their own missions, and the team's to owners and managers", async () => {
      await launch(u.sdr, { title: "La mienne", steps: [{ id: "s1", action: "select_leads", input: { verdict: "any", limit: 5 } }] })
      await missions.proposeMission(u.closer, policy, { title: "Celle du closer", steps: [{ id: "s1", action: "select_leads", input: { verdict: "any", limit: 5 } }] })
      expect((await missions.listMissions(u.sdr)).map((m) => m.title)).toEqual(["La mienne"])
      expect((await missions.listMissions(u.manager)).map((m) => m.title).sort()).toEqual(["Celle du closer", "La mienne"])
      expect((await rejection(missions.missionView(u.sdr, (await prisma.agentMission.findFirstOrThrow({ where: { title: "Celle du closer" } })).id))).status).toBe(404)
    })
  })

  describe("from the copilot", () => {
    let script: { text?: string; tools?: { name: string; input: unknown }[] }[] = []
    let callId = 0
    const model = new MockLanguageModelV4({
      doStream: async () => {
        const step = script.shift() ?? { text: "D'accord." }
        return {
          stream: simulateReadableStream({
            chunks: [
              ...(step.text ? [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: step.text }, { type: "text-end", id: "t" }] : []),
              ...(step.tools ?? []).map((t) => ({ type: "tool-call", toolCallId: `call-${++callId}`, toolName: t.name, input: JSON.stringify(t.input) })),
              { type: "finish", finishReason: { unified: step.tools?.length ? "tool-calls" : "stop", raw: undefined }, usage: usage(3_000, 300) },
            ],
          }),
        } as never
      },
    })
    async function turn(user: U, body: Record<string, unknown>) {
      const tasks: Promise<unknown>[] = []
      const res = await copilot.copilotTurn(user, body, undefined, { languageModel: () => model, prices: PRICES, keepAlive: (t) => tasks.push(t) })
      await res.text()
      await Promise.all(tasks)
      return res.headers.get(copilot.CONVERSATION_HEADER)!
    }

    it("proposes a plan without a click, which the next question lets expire", async () => {
      script = [{ tools: [{ name: "propose_mission", input: architects }] }, { text: "Voici le plan : un clic le lance." }]
      const conversationId = await turn(u.owner, { message: { id: "q1", role: "user", parts: [{ type: "text", text: "Recherche 1 000 architectes à Nantes" }] } })
      const answer = (await conversations.loadMessages(conversationId)).at(-1)!
      const part = answer.parts.find((p) => p.type === "tool-propose_mission") as unknown as { state: string; output: Record<string, unknown> }
      expect(part).toMatchObject({ state: "output-available", output: { proposed: true, title: "Architectes Nantes" } })
      expect(flat(part.output.cost as string)).toBe("environ 0,15 €, 1,25 € au plus")
      const mission = await prisma.agentMission.findUniqueOrThrow({ where: { id: part.output.missionId as string } })
      expect(mission).toMatchObject({ status: "PROPOSED", conversationId, requestedById: u.owner.id })
      expect(await prisma.campaign.count()).toBe(0)

      script = [{ text: "Bien sûr." }]
      await turn(u.owner, { conversationId, message: { id: "q2", role: "user", parts: [{ type: "text", text: "Et combien de temps ça prend ?" }] } })
      expect((await prisma.agentMission.findUniqueOrThrow({ where: { id: mission.id } })).status).toBe("EXPIRED")
      expect((await rejection(missions.actOnMission(u.owner, mission.id, { action: "approve" }))).message).toMatch(/a expiré/)
    })
  })
})
