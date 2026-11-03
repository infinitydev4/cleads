// E27 AI quality. Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/quality.integration.test.ts
// Models are mocks: no call ever leaves the machine.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { Experimental_DecisionMockModelV4, MockLanguageModelV4, simulateReadableStream } from "ai/test"
import { proveModel } from "./helpers/evaluation-proof"
import { resetDatabase } from "./helpers/reset-db"

vi.mock("@/lib/ai/realtime", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai/realtime")>()), publishNotifications: vi.fn(async () => {}) }))

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const SONNET = "anthropic/claude-sonnet-5.5"
const HAIKU = "anthropic/claude-haiku-5.5"
const OPUS = "anthropic/claude-opus-5.5"
const JEV = "typesafe-ai/jev"
const LUNA = "openai/gpt-6-luna-decisions"

const usage = (input: number, output: number) => ({ inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: output, text: output, reasoning: undefined } })
type Prompt = { role: string; content: string | { type: string; text?: string }[] }[]
const flat = (prompt: unknown, role: string) =>
  (prompt as Prompt)
    .filter((m) => m.role === role)
    .map((m) => (typeof m.content === "string" ? m.content : m.content.map((p) => p.text ?? "").join("")))
    .join("\n")

const EMAIL_BODY =
  "Bonjour Bruno, en regardant votre site, j'ai vu qu'il met plus de sept secondes à s'afficher sur un téléphone et qu'il n'est pas sécurisé. La plupart de vos clients vous cherchent pourtant depuis leur mobile, souvent en urgence, et repartent vers un autre plombier quand la page tarde. Nous refaisons des sites rapides et clairs pour les artisans de Lyon, en gardant ce qui marche déjà. Auriez-vous quinze minutes cette semaine pour en parler ?"

const PAGE = `\`\`\`html
<header class="px-6 py-4"><a href="tel:+33199001201" class="rounded-lg bg-brand px-4 py-3 text-brand-ink">Appeler</a></header>
<main><section class="p-6"><h1 class="text-4xl">Votre plombier à Lyon 7e</h1><p class="text-slate-900">Dépannage depuis 1998.</p><script>alert(1)</script></section></main>
\`\`\``

suite("AI quality (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let runs: typeof import("@/features/ai/runs")
  let service: typeof import("@/features/quality/service")
  let run: typeof import("@/features/quality/run")
  let dashboard: typeof import("@/features/quality/dashboard")
  let settings: typeof import("@/features/ai/settings")
  let definitions: typeof import("@/features/ai/definitions")
  let suites: typeof import("@/features/quality/suites")
  let team: typeof import("@/features/quality/team")
  let PRICES: typeof import("@/lib/ai/pricing").DEFAULT_PRICES
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let calls: { model: string; kind: string }[] = []

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    runs = await import("@/features/ai/runs")
    service = await import("@/features/quality/service")
    run = await import("@/features/quality/run")
    dashboard = await import("@/features/quality/dashboard")
    settings = await import("@/features/ai/settings")
    definitions = await import("@/features/ai/definitions")
    suites = await import("@/features/quality/suites")
    team = await import("@/features/quality/team")
    PRICES = (await import("@/lib/ai/pricing")).DEFAULT_PRICES
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    calls = []
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@quality.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
  })

  /** One mock per model id: the answer depends on the step, read from its instructions; Haiku invents an evidence id. */
  const language = (id: string) =>
    new MockLanguageModelV4({
      doGenerate: async (options) => {
        const system = flat(options.prompt, "system")
        const user = flat(options.prompt, "user")
        let kind = "other"
        let answer: unknown = {}
        if (system.includes("Tu lis les pages du site")) {
          kind = "extract"
          answer = { activity: "Artisan", services: [], area: null, audience: null, headline: null, ctas: [], proofs: [], faq: user.includes("Questions fréquentes"), entityClear: !/Votre partenaire pour tous vos projets|réinventé/.test(user), outdatedSigns: [], frictions: [] }
        } else if (user.includes("Rends ton analyse d'expert")) {
          kind = "analyze"
          const ev = /^- ([PMCS]\d+) :/m.exec(user)?.[1] ?? "S1"
          answer = { imageScore: null, conversionScore: 55, findings: [{ area: "conversion", severity: "medium", title: "Appel à l'action discret", detail: "Le bouton se voit peu.", evidence: [ev] }], strengths: [], frictions: [], opportunities: [{ text: "Mettre le téléphone en avant", evidence: id === HAIKU ? ["Z9"] : [ev] }], signals: [], summary: ["Un", "Deux", "Trois"] }
        } else if (user.includes("Prépare le pitch du closer")) {
          kind = "pitch"
          const slugs = [...user.matchAll(/- `([a-z0-9-]+)` —/g)].map((m) => m[1])
          const ev = /- (S1|P1|M1) :/.exec(user)?.[1] ?? "S1"
          answer = {
            headline: "Un site qui ne suit plus",
            recommendations: slugs.slice(0, 2).map((offer, i) => ({ offer, role: i ? "complement" : "main", fit: 80, why: "Parce que l'audit le montre.", gain: "Plus de demandes.", evidence: [ev], objection: null })),
            script: { opening: "Bonjour", hook: { text: "Votre site ?", evidence: [ev] }, questions: ["Combien de demandes ?"], proposal: "La refonte.", close: "Jeudi ?" },
            objections: [],
            email: { subject: "Votre site", angle: "Le constat.", evidence: [ev] },
          }
        } else if (user.includes("Rédige le premier email")) {
          kind = "draft"
          const ev = /- (M4|M1|S1|P1) :/.exec(user)?.[1] ?? "S1"
          answer = { subject: "Votre site sur téléphone", body: EMAIL_BODY, facts: [{ text: "Plus de sept secondes sur mobile", evidence: [ev] }] }
        } else if (system.includes("directeur commercial")) {
          kind = "judge"
          answer = { personnalisation: 4, demande_unique: 5, faits_exacts: 4, ton: 5, orthographe: 5, commentaire: "" }
        } else if (system.includes("Tu classes les réponses")) {
          kind = "classify"
          answer = { reply: "INTERESTED", confidence: 0.95, urgency: "NORMAL", action: true }
        } else if (system.includes("Tu juges si une entreprise")) {
          kind = "relevance"
          answer = { verdict: "RELEVANT", confidence: 0.7 }
        } else if (user.includes("Captures de la landing")) {
          kind = "critique"
          answer = { scores: { hierarchy: 4, readability: 4, contrast: 4, mobile: 4, brand: 4, conversion: 4 }, issues: [], summary: "Propre." }
        }
        calls.push({ model: id, kind })
        return { content: [{ type: "text", text: JSON.stringify(answer) }], finishReason: { unified: "stop", raw: undefined }, usage: usage(3_000, 600), warnings: [] }
      },
      doStream: async () => {
        calls.push({ model: id, kind: "page" })
        return {
          stream: simulateReadableStream({
            chunks: [{ type: "text-start", id: "t" }, { type: "text-delta" as const, id: "t", delta: PAGE }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: undefined }, logprobs: undefined, usage: usage(7_000, 9_000) }],
          }),
        } as never
      },
    })

  /** Decision models answer with the rules' class, sure of themselves; Luna always says « interested ». */
  const decision = (id: string) =>
    new Experimental_DecisionMockModelV4({
      doDecide: async (options) => {
        calls.push({ model: id, kind: "decide" })
        const state = options.state.map((p) => (p.type === "text" ? p.text : "")).join("\n")
        const questions = Object.keys((options as { questions: Record<string, unknown> }).questions)
        if (questions.includes("relevance")) return { answers: { relevance: { type: "choice", choice: "RELEVANT", probabilities: { RELEVANT: 0.9, MAYBE: 0.05, NOT_RELEVANT: 0.05 } } }, usage: { inputTokens: 500, outputTokens: 0 }, warnings: [] }
        const { replyRules } = await import("@/features/quality/baselines")
        const choice = id === LUNA ? "INTERESTED" : replyRules({ subject: "", body: state }).reply
        const classes = ["INTERESTED", "NOT_NOW", "NOT_INTERESTED", "OUT_OF_OFFICE", "WRONG_PERSON", "STOP", "OTHER"]
        return {
          answers: {
            reply: { type: "choice", choice, probabilities: Object.fromEntries(classes.map((c) => [c, c === choice ? 0.94 : 0.01])) },
            urgency: { type: "choice", choice: "LOW", probabilities: { HIGH: 0.1, NORMAL: 0.1, LOW: 0.8 } },
            action: { type: "boolean", probability: 0.2 },
          },
          usage: { inputTokens: 800, outputTokens: 0 },
          warnings: [],
        } as never
      },
    })

  /** A browser that answers from memory. */
  const renderer = async () => ({
    async prepareImages() {
      return []
    },
    async render() {
      const tile = { data: new Uint8Array([255, 216, 255]), mediaType: "image/jpeg" as const }
      return { desktop: new Uint8Array([1]), mobile: new Uint8Array([2]), thumb: new Uint8Array([3]), tiles: [{ ...tile, label: "ordinateur 1" }, { ...tile, label: "téléphone 1" }], axe: { critical: 0, serious: 0, moderate: 0, minor: 0, violations: [] }, heights: { desktop: 1800, mobile: 3200 } }
    },
    async close() {},
  })

  // Prices are read once the modules are loaded: the Gateway's list is never fetched in tests.
  const deps = () => ({ languageModel: language, decisionModel: decision, prices: PRICES, renderer })

  async function execute(evaluationId: string, opts: { signal?: AbortSignal } = {}) {
    const e = await prisma.aiEvaluation.findUniqueOrThrow({ where: { id: evaluationId } })
    const ctx = await runs.loadRunContext(e.runId!)
    return run.runEvaluation({ run: ctx, attempt: 1, input: { kind: run.EVALUATION, evaluationId }, approved: [], signal: opts.signal ?? new AbortController().signal }, deps())
  }

  async function catalog() {
    const { ensureAgentCatalog } = await import("@/features/ai/catalog")
    await ensureAgentCatalog(ws)
  }

  describe("launching", () => {
    it("is for owners and managers, puts the model in service first and reserves the estimate", async () => {
      await expect(service.startEvaluation(u.sdr, { suite: "replies", role: "decision", contenders: [] })).rejects.toMatchObject({ status: 403 })
      const view = await service.startEvaluation(u.manager, { suite: "replies", role: "decision", contenders: [HAIKU, "rules", JEV] })
      expect(view.contenders.map((c) => c.id)).toEqual([JEV, HAIKU, "rules"])
      expect(view.cases).toBe(suites.SUITES.replies.quick.length)
      expect(view.status).toBe("QUEUED")
      const r = await prisma.agentRun.findUniqueOrThrow({ where: { id: view.runId! } })
      expect(r).toMatchObject({ agentId: "replies", priority: -1, requestedById: u.manager.id, input: { kind: "evaluation" } })
      expect(r.capMicros).toBeGreaterThan(eurToMicros(view.estimateEur))
      await expect(service.startEvaluation(u.owner, { suite: "replies", role: "decision", contenders: [] })).rejects.toMatchObject({ status: 409 })
      await expect(service.startEvaluation(u.owner, { suite: "qualifier", role: "decision", contenders: ["openai/gpt-7"] })).rejects.toMatchObject({ status: 400 })
      await expect(service.startEvaluation(u.owner, { suite: "offers", role: "decision", contenders: [] })).rejects.toMatchObject({ status: 400 })
      expect(await prisma.auditLog.count({ where: { action: "ai.evaluation_started" } })).toBe(1)
    })

    it("needs enough cases labelled by the team to run on them", async () => {
      await expect(service.startEvaluation(u.owner, { suite: "replies", role: "decision", contenders: [], source: "team" })).rejects.toMatchObject({ status: 409 })
      await expect(service.startEvaluation(u.owner, { suite: "writer", role: "writer", contenders: [], source: "team" })).rejects.toMatchObject({ status: 400 })
    })
  })

  describe("measuring", () => {
    it("compares Jev, a language model and the rules on the same replies, once each, billed under « Évaluations »", { timeout: 60_000 }, async () => {
      const view = await service.startEvaluation(u.owner, { suite: "replies", role: "decision", contenders: [HAIKU, "rules"] })
      const out = await execute(view.id)
      const n = suites.SUITES.replies.quick.length
      expect(await prisma.aiEvaluationCase.count({ where: { evaluationId: view.id } })).toBe(3 * n)
      expect(Object.keys(out.output.scores)).toEqual([JEV, HAIKU, "rules"])
      const e = await service.evaluationDetail(u.owner, view.id)
      const [jev, haiku, rules] = e.results!
      expect(rules).toMatchObject({ contender: "rules", costMicros: 0, failed: 0 })
      expect(jev.costMicros).toBeGreaterThan(0)
      expect(haiku.measures.accuracy).toBeLessThan(jev.measures.accuracy!)
      expect(jev.measures.stopRecall).toBe(rules.measures.stopRecall)
      expect(jev.calibration?.length).toBeGreaterThan(0)
      // Each model is the one measured: no fallback answers in its place.
      const steps = await prisma.agentStep.findMany({ where: { runId: view.runId! }, select: { model: true, type: true } })
      expect(new Set(steps.filter((s) => s.type === "DECISION").map((s) => s.model))).toEqual(new Set([JEV]))
      expect(new Set(steps.filter((s) => s.type === "MODEL").map((s) => s.model))).toEqual(new Set([HAIKU]))
      expect(new Set((await prisma.aiUsage.findMany({ where: { workspaceId: ws } })).map((x) => x.agentId))).toEqual(new Set(["evaluations"]))
      // A second pass (a worker restart) adds nothing.
      await execute(view.id)
      expect(await prisma.aiEvaluationCase.count({ where: { evaluationId: view.id } })).toBe(3 * n)
      expect(e.caseRows[0].title).toMatch(/^« /)
    })

    it("measures the Auditeur on frozen sites and catches a made-up proof", { timeout: 60_000 }, async () => {
      await catalog()
      const view = await service.startEvaluation(u.owner, { suite: "auditor", role: "writer", contenders: [HAIKU] })
      await execute(view.id)
      const e = await service.evaluationDetail(u.owner, view.id)
      const [sonnet, haiku] = e.results!
      expect(sonnet.measures.evidence).toBe(1)
      expect(haiku.measures.evidence).toBeLessThan(1)
      expect(haiku.hard).toContain("Des éléments de l'analyse citent une preuve qui n'existe pas")
      expect(e.comparisons[HAIKU].verdict).toBe("regression")
      // The reading step was the fast model in service, the analysis the contender.
      const n = suites.SUITES.auditor.quick.length
      expect(calls.filter((c) => c.kind === "analyze").map((c) => c.model)).toEqual([...Array(n).fill(SONNET), ...Array(n).fill(HAIKU)])
      expect(new Set(calls.filter((c) => c.kind === "extract").map((c) => c.model))).toEqual(new Set([HAIKU]))
      expect(sonnet.measures.reading).toBe(1)
      expect(sonnet.measures.recall).toBe(1)
    })

    it("measures the Conseiller offres, the Rédacteur with its judge and the Designer in the browser", { timeout: 60_000 }, async () => {
      await catalog()
      const offers = await service.startEvaluation(u.owner, { suite: "offers", role: "writer", contenders: [] })
      await execute(offers.id)
      const writer = await service.startEvaluation(u.owner, { suite: "writer", role: "writer", contenders: [] })
      await execute(writer.id)
      const designer = await service.startEvaluation(u.owner, { suite: "designer", role: "designer", contenders: [] })
      await execute(designer.id)

      const o = (await service.evaluationDetail(u.owner, offers.id)).results![0]
      expect(o).toMatchObject({ contender: SONNET, failed: 0 })
      expect(o.measures.evidence).toBe(1)
      expect(o.measures.mainHit).toBeGreaterThan(0)

      const w = await service.evaluationDetail(u.owner, writer.id)
      expect(w.results![0].measures.rubric).toBe(4.6)
      expect(w.results![0].judgeMicros).toBeGreaterThan(0)
      expect(w.caseRows[0].detail).toMatchObject({ checksPassed: { ok: 9, total: 9 } })
      // The judge is always the same model, apart from what is compared.
      expect(calls.filter((c) => c.kind === "judge").every((c) => c.model === SONNET)).toBe(true)

      const d = (await service.evaluationDetail(u.owner, designer.id)).results![0]
      expect(d).toMatchObject({ contender: OPUS, failed: 0 })
      expect(d.measures.critique).toBe(4)
      expect(d.measures.scripts).toBe(1)
    })

    it("stops at its cap and keeps what it measured", { timeout: 60_000 }, async () => {
      const view = await service.startEvaluation(u.owner, { suite: "qualifier", role: "decision", contenders: [HAIKU] })
      await prisma.agentRun.update({ where: { id: view.runId! }, data: { capMicros: 120, reservedMicros: 120 } })
      await expect(execute(view.id)).rejects.toMatchObject({ code: "budget_exceeded" })
      const e = await service.evaluationDetail(u.owner, view.id)
      expect(e.status).toBe("BUDGET_EXCEEDED")
      expect(e.done).toBeGreaterThan(0)
      expect(e.done).toBeLessThan(2 * suites.SUITES.qualifier.quick.length)
      expect(e.results![0].cases).toBeGreaterThan(0)
    })
  })

  describe("model changes", () => {
    /** A finished evaluation of `model` against the model in service, with the scores given. */
    const proof = (suite: "replies" | "qualifier" | "auditor", role: "decision" | "writer", baseline: string, model: string, scores: [number, number]) =>
      proveModel(prisma, { workspaceId: ws, requestedById: u.owner.id, suites: [suite], role, baseline, model, scores })

    it("needs the new model measured on every suite the role touches", async () => {
      await expect(settings.updateAiSettings(u.owner, { roleModels: { decision: LUNA } })).rejects.toMatchObject({ status: 409, extra: { gate: "missing" } })
      await proof("replies", "decision", JEV, LUNA, [90, 91])
      await expect(settings.updateAiSettings(u.owner, { roleModels: { decision: LUNA } })).rejects.toMatchObject({ extra: { evidence: { missing: ["qualifier"] } } })
      await proof("qualifier", "decision", JEV, LUNA, [80, 82])
      const view = await settings.updateAiSettings(u.owner, { roleModels: { decision: LUNA } })
      expect(view.roles.find((r) => r.id === "decision")?.model).toBe(LUNA)
      const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "ai.settings_updated" } })
      expect((log.metadata as { evidence: { suites: unknown[] }[] }).evidence[0].suites).toHaveLength(2)
      // Back to the default needs no proof.
      await settings.updateAiSettings(u.owner, { roleModels: { decision: JEV } })
    })

    it("shows a regression and asks for it to be confirmed", async () => {
      await proof("replies", "decision", JEV, LUNA, [90, 70])
      await proof("qualifier", "decision", JEV, LUNA, [80, 81])
      await expect(settings.updateAiSettings(u.owner, { roleModels: { decision: LUNA } })).rejects.toMatchObject({ extra: { gate: "regression", evidence: { regressions: ["replies"] } } })
      await settings.updateAiSettings(u.owner, { roleModels: { decision: LUNA }, acceptRegressions: ["decision"] })
      const proofOf = await service.evidenceFor(u.owner, { role: "decision", model: LUNA })
      expect(proofOf.suites.map((s) => s.comparison?.verdict)).toEqual(["regression", "equivalent"])
    })

    it("needs an agent moved to another role measured with that role's model", async () => {
      await catalog()
      await expect(definitions.updateAgentDefinition(u.owner, "auditor", { modelRole: "fast" })).rejects.toMatchObject({ status: 409, extra: { gate: "missing" } })
      await proof("auditor", "writer", SONNET, HAIKU, [88, 86])
      const view = await definitions.updateAgentDefinition(u.owner, "auditor", { modelRole: "fast" })
      expect(view.modelRole).toBe("fast")
      // Agents without a suite change freely; back to the agent's own role too.
      await definitions.updateAgentDefinition(u.owner, "copilot", { modelRole: "fast" })
      await definitions.updateAgentDefinition(u.owner, "auditor", { modelRole: "writer" })
    })
  })

  describe("dashboard", () => {
    it("counts what the agents did for the team, apart from tests and evaluations", async () => {
      const company = await prisma.company.create({ data: { workspaceId: ws, name: "Plomberie Roche (démo)" } })
      const lead = await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, ownerId: u.sdr.id } })
      const done = { status: "SUCCEEDED" as const, capMicros: 1, startedAt: new Date(Date.now() - 4_000), finishedAt: new Date() }
      await prisma.agentRun.createMany({
        data: [
          { workspaceId: ws, agentId: "offers", costMicros: 50_000, ...done },
          { workspaceId: ws, agentId: "offers", costMicros: 70_000, ...done },
          { workspaceId: ws, agentId: "offers", status: "FAILED", capMicros: 1, costMicros: 0, error: "Le compte Vercel AI Gateway n'a pas accès à Claude Sonnet 5.5 (offre gratuite). Ajoutez des crédits." },
          { workspaceId: ws, agentId: "offers", status: "FAILED", capMicros: 1, costMicros: 0, error: "Le compte Vercel AI Gateway n'a pas accès à Claude Sonnet 5.5 (offre gratuite). Ajoutez des crédits." },
          { workspaceId: ws, agentId: "writer", costMicros: 30_000, input: { kind: "first_email" }, ...done },
          { workspaceId: ws, agentId: "auditor", costMicros: 900_000, input: { kind: "evaluation", evaluationId: "x" }, ...done },
          { workspaceId: ws, agentId: "writer", costMicros: 20_000, input: { kind: "skill_test" }, ...done },
        ],
      })
      const pitch = await prisma.offerPitch.create({ data: { workspaceId: ws, leadId: lead.id, headline: "h", script: {}, objections: [], evidence: [] } })
      const rec = (rank: number, status: "ACCEPTED" | "REJECTED" | "SUGGESTED", reason?: "TOO_EXPENSIVE") => ({ workspaceId: ws, pitchId: pitch.id, rank, role: "MAIN" as const, offerSlug: `o${rank}`, offerName: "Offre", category: "SEO" as const, billing: "MONTHLY" as const, fit: 80, why: "w", gain: "g", evidence: ["S1"], status, reason, ...(status === "SUGGESTED" ? {} : { decidedAt: new Date(), decidedById: u.sdr.id }) })
      await prisma.offerRecommendation.createMany({ data: [rec(1, "ACCEPTED"), rec(2, "ACCEPTED"), rec(3, "REJECTED", "TOO_EXPENSIVE"), rec(4, "SUGGESTED")] })
      await prisma.emailDraft.createMany({ data: [0.05, 0.2, 0.6].map((editRatio) => ({ workspaceId: ws, kind: "FIRST_EMAIL" as const, leadId: lead.id, subject: "s", body: "b", editRatio, sentAt: new Date() })) })
      const mailbox = await prisma.mailbox.create({ data: { workspaceId: ws, address: "sdr@quality.test", displayName: "SDR", smtpHost: "smtp.test", smtpPort: 465, username: "sdr", secret: "x" } })
      const reply = (i: number, replyClass: "INTERESTED" | "STOP" | null) => prisma.emailMessage.create({ data: { workspaceId: ws, mailboxId: mailbox.id, direction: "INBOUND", status: "RECEIVED", fromEmail: `p${i}@prospect.test`, toEmail: "sdr@quality.test", subject: "Re", bodyText: "…", messageId: `<${i}@prospect.test>`, replyClass } })
      const [a, b, c] = await Promise.all([reply(1, "INTERESTED"), reply(2, "STOP"), reply(3, null)])
      await prisma.replyTriage.createMany({
        data: [
          { workspaceId: ws, emailId: a.id, replyClass: "INTERESTED", classConfidence: 0.9, outcome: "AUTO", model: JEV },
          { workspaceId: ws, emailId: b.id, replyClass: "NOT_INTERESTED", classConfidence: 0.7, outcome: "REVIEW", model: JEV },
          { workspaceId: ws, emailId: c.id, replyClass: "OTHER", classConfidence: 0.4, outcome: "HUMAN", model: JEV },
        ],
      })
      // Only the replies a person filed are labels: the first one here.
      await prisma.activity.create({ data: { workspaceId: ws, leadId: lead.id, actorId: u.sdr.id, actorKind: "USER", kind: "EMAIL", body: "classée", data: { event: "reply_classified", emailId: a.id, replyClass: "INTERESTED" } } })

      await expect(dashboard.qualityDashboard(u.sdr)).rejects.toMatchObject({ status: 403 })
      const d = await dashboard.qualityDashboard(u.manager, 30)
      const offers = d.agents.find((x) => x.id === "offers")!
      expect(offers).toMatchObject({ runs: 4, succeeded: 2, failed: 2, successRate: 0.5, costEur: 0.12 })
      expect(offers.medianMs).toBeGreaterThan(3_000)
      expect(offers.usefulness).toMatchObject({ value: 2 / 3, samples: 3 })
      expect(d.agents.find((x) => x.id === "writer")).toMatchObject({ runs: 1, costEur: 0.03 })
      expect(d.agents.find((x) => x.id === "auditor")).toMatchObject({ runs: 0 })
      expect(d.totals).toMatchObject({ evaluationsEur: 0.9, testsEur: 0.02 })
      expect(d.offers).toMatchObject({ accepted: 2, rejected: 1, pending: 1, reasons: [{ reason: "TOO_EXPENSIVE", count: 1 }] })
      expect(d.drafts).toMatchObject({ sent: 3, medianEdit: 0.2, nearlyAsWritten: 1, rewritten: 1 })
      expect(d.replies).toMatchObject({ confirmed: 2, agreed: 1, labels: 1, target: 200 })
      expect(d.errors).toEqual([expect.objectContaining({ agentId: "offers", count: 2 })])
      expect(await team.teamCaseIds(ws, "replies")).toEqual([`team:${a.id}`])
    })
  })
})

const eurToMicros = (eur: number) => Math.round(eur * 1_000_000)
