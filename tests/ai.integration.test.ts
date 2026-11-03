// E17 AI foundation. Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/ai.integration.test.ts
// Models are mocks: no call ever leaves the machine.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { MockLanguageModelV4, Experimental_DecisionMockModelV4 } from "ai/test"
import { z } from "zod"
import { publishNotifications } from "@/lib/ai/realtime"
import { proveModel } from "./helpers/evaluation-proof"
import { resetDatabase } from "./helpers/reset-db"

// What would reach the bells live is recorded: Pusher itself is never set up in tests.
vi.mock("@/lib/ai/realtime", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai/realtime")>()), publishNotifications: vi.fn(async () => {}) }))

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("AI foundation (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let runs: typeof import("@/features/ai/runs")
  let calls: typeof import("@/features/ai/calls")
  let approvals: typeof import("@/features/ai/approvals")
  let tools: typeof import("@/features/ai/tools")
  let settings: typeof import("@/features/ai/settings")
  let budget: typeof import("@/lib/ai/budget")
  let PRICES: typeof import("@/lib/ai/pricing").DEFAULT_PRICES
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  const leads: Record<string, string> = {}

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    runs = await import("@/features/ai/runs")
    calls = await import("@/features/ai/calls")
    approvals = await import("@/features/ai/approvals")
    tools = await import("@/features/ai/tools")
    settings = await import("@/features/ai/settings")
    budget = await import("@/lib/ai/budget")
    PRICES = (await import("@/lib/ai/pricing")).DEFAULT_PRICES
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["sdr2", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@ai.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
    for (const [key, ownerId] of [["pool", null], ["mine", u.sdr.id], ["other", u.sdr2.id]] as const) {
      const c = await prisma.company.create({ data: { workspaceId: ws, name: `Entreprise ${key}` } })
      leads[key] = (await prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, ownerId } })).id
    }
  })

  const caps = (monthlyEur: number, dailyEur: number) =>
    prisma.aiSetting.upsert({
      where: { workspaceId: ws },
      create: { workspaceId: ws, monthlyCapMicros: monthlyEur * 1e6, userDailyCapMicros: dailyEur * 1e6 },
      update: { monthlyCapMicros: monthlyEur * 1e6, userDailyCapMicros: dailyEur * 1e6 },
    })
  const textModel = (text = "Brouillon", input = 1000, output = 500, seen?: { maxOutputTokens?: number; calls: number }) =>
    new MockLanguageModelV4({
      doGenerate: async (options) => {
        if (seen) {
          seen.calls++
          seen.maxOutputTokens = options.maxOutputTokens
        }
        return {
          content: [{ type: "text", text }],
          finishReason: { unified: "stop", raw: undefined },
          usage: { inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: output, text: output, reasoning: undefined } },
          warnings: [],
        }
      },
    })

  describe("starting runs", () => {
    it("reserves the agent's cap and traces who started it", async () => {
      const ctx = await runs.startRun(u.sdr, { agentId: "auditor", leadId: leads.pool })
      const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })
      expect(run).toMatchObject({ status: "QUEUED", agentId: "auditor", requestedById: u.sdr.id, leadId: leads.pool, capMicros: 300_000, reservedMicros: 300_000, costMicros: 0 })
      expect(ctx.userKey).toBe(u.sdr.id)
      expect(await prisma.aiSetting.count({ where: { workspaceId: ws } })).toBe(1)
      expect(await prisma.auditLog.count({ where: { action: "ai.run_started", entityId: ctx.id, actorId: u.sdr.id } })).toBe(1)
    })

    it("refuses readers, and fiches the person cannot work on", async () => {
      await expect(runs.startRun(u.viewer, { agentId: "auditor" })).rejects.toMatchObject({ status: 403 })
      await expect(runs.startRun(u.sdr, { agentId: "auditor", leadId: leads.other })).rejects.toMatchObject({ status: 403 })
      await expect(runs.startRun(u.closer, { agentId: "auditor", leadId: leads.pool })).rejects.toMatchObject({ status: 403 })
      await expect(runs.startRun(u.sdr, { agentId: "auditor", leadId: "missing" })).rejects.toMatchObject({ status: 404 })
      await expect(runs.startRun(u.manager, { agentId: "auditor", leadId: leads.other })).resolves.toBeTruthy()
    })

    it("refuses beyond the personal daily quota and beyond the month's cap, saying which", async () => {
      await caps(1, 0.5)
      await runs.startRun(u.sdr, { agentId: "auditor" })
      await expect(runs.startRun(u.sdr, { agentId: "auditor" })).rejects.toMatchObject({ code: "budget_exceeded", status: 429, extra: { scope: "day", remainingMicros: 200_000 } })
      await expect(runs.startRun(u.manager, { agentId: "designer" })).rejects.toMatchObject({ code: "budget_exceeded", extra: { scope: "month", remainingMicros: 700_000 } })
    })

    it("holds the month's cap when ten runs start at the same time", async () => {
      await caps(1, 100)
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => runs.startRun(u.owner, { agentId: "auditor" })))
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3)
      expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason.code === "budget_exceeded")).toBe(true)
      const held = await prisma.agentRun.aggregate({ _sum: { reservedMicros: true } })
      expect(held._sum.reservedMicros).toBe(900_000)
    })

    it("counts scheduled work against the month only, and re-reads the requester's rights", async () => {
      await caps(1, 0.1)
      const sys = await runs.startSystemRun(ws, { agentId: "auditor" })
      expect(sys.userKey).toBe("system")
      expect(sys.requester).toBeNull()
      const ctx = await runs.startRun(u.manager, { agentId: "writer" })
      await prisma.user.update({ where: { id: u.manager.id }, data: { active: false } })
      const loaded = await runs.loadRunContext(ctx.id)
      expect(loaded.requester).toBeNull()
      expect(loaded.userKey).toBe(u.manager.id)
    })
  })

  describe("billed model calls", () => {
    it("bills a call to its run and to the day's usage, within what the run can pay", async () => {
      const ctx = await runs.startRun(u.sdr, { agentId: "writer", leadId: leads.mine, status: "RUNNING" })
      const seen = { calls: 0 } as { maxOutputTokens?: number; calls: number }
      const res = await calls.generateForRun(ctx, { role: "writer", name: "draft", prompt: "Bonjour" }, { languageModel: () => textModel("Brouillon", 1000, 500, seen), prices: PRICES })
      expect(res).toMatchObject({ text: "Brouillon", model: "anthropic/claude-sonnet-5.5", costMicros: 6440 })
      expect(seen.maxOutputTokens).toBe(4096)
      const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })
      expect(run).toMatchObject({ costMicros: 6440, reservedMicros: 50_000 - 6440, stepCount: 1 })
      const step = await prisma.agentStep.findFirstOrThrow({ where: { runId: ctx.id } })
      expect(step).toMatchObject({ index: 1, type: "MODEL", name: "draft", model: "anthropic/claude-sonnet-5.5", inputTokens: 1000, outputTokens: 500, costMicros: 6440 })
      const usage = await prisma.aiUsage.findFirstOrThrow({ where: { workspaceId: ws } })
      expect(usage).toMatchObject({ userKey: u.sdr.id, agentId: "writer", model: "anthropic/claude-sonnet-5.5", calls: 1, costMicros: 6440 })
      await calls.generateForRun(ctx, { role: "writer", name: "draft-2", prompt: "Encore" }, { languageModel: () => textModel(), prices: PRICES })
      expect((await prisma.aiUsage.findFirstOrThrow({ where: { workspaceId: ws } })).calls).toBe(2)
      expect(await runs.finishRun(ctx.id, { status: "SUCCEEDED", output: { ok: true } })).toBe(true)
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })).toMatchObject({ status: "SUCCEEDED", reservedMicros: 0, costMicros: 12_880 })
      expect(await runs.finishRun(ctx.id, { status: "FAILED" })).toBe(false)
    })

    it("returns structured answers validated by their schema", async () => {
      const ctx = await runs.startRun(u.sdr, { agentId: "writer", status: "RUNNING" })
      const res = await calls.generateForRun(ctx, { role: "writer", name: "subject", prompt: "Objet ?", schema: z.object({ subject: z.string() }) }, { languageModel: () => textModel('{"subject":"Votre site"}'), prices: PRICES })
      expect(res.output).toEqual({ subject: "Votre site" })
    })

    it("stops a run before it exceeds its own cap, without calling the model", async () => {
      const ctx = await runs.startRun(u.sdr, { agentId: "writer", status: "RUNNING" })
      await prisma.agentRun.update({ where: { id: ctx.id }, data: { costMicros: 49_000 } })
      const seen = { calls: 0 }
      await expect(calls.generateForRun(ctx, { role: "writer", name: "draft", prompt: "Bonjour" }, { languageModel: () => textModel("x", 1, 1, seen), prices: PRICES })).rejects.toMatchObject({ code: "budget_exceeded", extra: { scope: "run" } })
      expect(seen.calls).toBe(0)
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })).toMatchObject({ status: "BUDGET_EXCEEDED", reservedMicros: 0 })
    })

    it("records a failed call and reports the service as unavailable", async () => {
      const ctx = await runs.startRun(u.sdr, { agentId: "writer", status: "RUNNING" })
      const broken = new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error("provider down")
        },
      })
      await expect(calls.generateForRun(ctx, { role: "writer", name: "draft", prompt: "Bonjour" }, { languageModel: () => broken, prices: PRICES })).rejects.toMatchObject({ code: "unavailable", status: 503 })
      const step = await prisma.agentStep.findFirstOrThrow({ where: { runId: ctx.id } })
      expect(step).toMatchObject({ type: "MODEL", costMicros: 0 })
      expect(JSON.stringify(step.output)).toContain("provider down")
    })

    it("bills an answer cut off at its length limit, and does not retry it", async () => {
      const ctx = await runs.startRun(u.sdr, { agentId: "writer", status: "RUNNING" })
      const cut = new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [{ type: "text", text: '{"subject":"Votre si' }],
          finishReason: { unified: "length", raw: "max_tokens" },
          usage: { inputTokens: { total: 4000, noCache: 4000, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 900, text: 400, reasoning: 500 } },
          warnings: [],
        }),
      })
      await expect(calls.generateForRun(ctx, { role: "writer", name: "subject", prompt: "Objet ?", schema: z.object({ subject: z.string() }) }, { languageModel: () => cut, prices: PRICES })).rejects.toMatchObject({ code: "invalid", status: 400 })
      const step = await prisma.agentStep.findFirstOrThrow({ where: { runId: ctx.id } })
      expect(step).toMatchObject({ type: "MODEL", model: "anthropic/claude-sonnet-5.5", inputTokens: 4000, outputTokens: 900, output: { finishReason: "length" } })
      expect(step.costMicros).toBeGreaterThan(0)
      expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })).costMicros).toBe(step.costMicros)
      expect((await prisma.aiUsage.aggregate({ where: { workspaceId: ws }, _sum: { costMicros: true } }))._sum.costMicros).toBe(step.costMicros)
    })

    it("decides with probabilities, records the decision and its tiny cost", async () => {
      const ctx = await runs.startRun(u.sdr, { agentId: "replies", status: "RUNNING" })
      const model = new Experimental_DecisionMockModelV4({
        doDecide: async () => ({
          answers: { reply: { type: "choice", choice: "later", probabilities: { later: 0.9, interested: 0.1 } }, unsubscribe: { type: "boolean", probability: 0.3 } },
          usage: { inputTokens: 1000, outputTokens: 0 },
          warnings: [],
        }),
      })
      const res = await calls.decideForRun(
        ctx,
        {
          name: "classify",
          state: "Merci, rappelez-moi en janvier.",
          questions: { reply: { type: "choice", criteria: { later: "Pas maintenant", interested: "Intéressé" } }, unsubscribe: { type: "boolean", instructions: "Demande-t-il à ne plus être contacté ?" } },
        },
        { decisionModel: () => model, prices: PRICES }
      )
      expect(res.answers.reply).toEqual({ type: "choice", value: "later", confidence: 0.9, outcome: "auto" })
      expect(res.answers.unsubscribe).toEqual({ type: "boolean", value: false, confidence: 0.7, outcome: "review" })
      expect(res).toMatchObject({ model: "typesafe-ai/jev", costMicros: 39 })
      expect(await prisma.agentStep.findFirstOrThrow({ where: { runId: ctx.id } })).toMatchObject({ type: "DECISION", model: "typesafe-ai/jev", costMicros: 39 })
    })
  })

  describe("budget alerts", () => {
    it("tells the owners once per threshold and per month", async () => {
      vi.mocked(publishNotifications).mockClear()
      await caps(1, 10)
      const day = budget.dayStart(new Date())
      await prisma.aiUsage.create({ data: { workspaceId: ws, day, userKey: u.sdr.id, agentId: "auditor", model: "anthropic/claude-sonnet-5.5", calls: 3, costMicros: 600_000 } })
      expect(await budget.checkBudgetAlerts(ws)).toEqual([50])
      expect(await budget.checkBudgetAlerts(ws)).toEqual([])
      await prisma.aiUsage.updateMany({ data: { costMicros: 1_050_000 } })
      expect(await budget.checkBudgetAlerts(ws)).toEqual([80, 100])
      const notes = await prisma.notification.findMany({ orderBy: { createdAt: "asc" } })
      expect(notes.map((n) => n.userId)).toEqual([u.owner.id, u.owner.id])
      expect(notes[1].title).toBe("Budget IA épuisé")
      // Each alert also reaches the bell live; a check that crosses nothing publishes nothing.
      expect(vi.mocked(publishNotifications).mock.calls.map(([sent]) => sent.map((n) => n.id))).toEqual([[notes[0].id], [notes[1].id]])
      await expect(runs.startRun(u.owner, { agentId: "replies" })).rejects.toMatchObject({ code: "budget_exceeded", extra: { scope: "month" } })
    })
  })

  describe("tools and approvals", () => {
    const sendTool = () =>
      tools.defineTool({
        name: "send_test",
        description: "Envoie un email de test",
        permission: "email:send",
        approval: "user",
        costClass: "external",
        family: "ai_work",
        input: z.object({ to: z.string() }),
        summarize: (i) => `Envoyer un email à ${i.to}`,
        execute: async () => ({ sent: true }),
      })

    it("checks the requester's right, and records what a tool did", async () => {
      const ctx = await runs.startRun(u.sdr, { agentId: "copilot", status: "RUNNING" })
      const teamTool = tools.defineTool({ name: "read_team", description: "Lit l'équipe", permission: "team:read", approval: "auto", costClass: "free", family: "read_crm", input: z.object({}), execute: async () => ({ n: 1 }) })
      await expect(tools.runTool(teamTool, { run: ctx }, {})).rejects.toMatchObject({ status: 403 })
      const readTool = tools.defineTool({ name: "read_lead", description: "Lit une fiche", permission: "lead:read", approval: "auto", costClass: "free", family: "read_crm", input: z.object({ id: z.string() }), execute: async (_c, i) => ({ id: i.id }) })
      await expect(tools.runTool(readTool, { run: ctx }, { id: "abc" })).resolves.toEqual({ status: "done", output: { id: "abc" } })
      await expect(tools.runTool(readTool, { run: ctx }, { id: 3 })).rejects.toThrow()
      const steps = await prisma.agentStep.findMany({ where: { runId: ctx.id } })
      expect(steps).toHaveLength(1)
      expect(steps[0]).toMatchObject({ type: "TOOL", name: "read_lead", output: { id: "abc" } })
    })

    it("asks a person before an outside action, and puts the run back in the queue once approved", async () => {
      const ctx = await runs.startRun(u.sdr, { agentId: "writer", leadId: leads.mine, status: "RUNNING" })
      const res = await tools.runTool(sendTool(), { run: ctx }, { to: "client@exemple.fr" })
      expect(res.status).toBe("pending_approval")
      const id = (res as { approvalId: string }).approvalId
      expect(await prisma.agentApproval.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "PENDING", tool: "send_test", permission: "email:send", requestedById: u.sdr.id, summary: "Envoyer un email à client@exemple.fr", payload: { to: "client@exemple.fr" } })
      expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })).status).toBe("WAITING_APPROVAL")
      expect(await prisma.agentStep.findFirst({ where: { runId: ctx.id, type: "APPROVAL" } })).toBeTruthy()

      const mine = await approvals.listApprovals(u.sdr)
      expect(mine).toHaveLength(1)
      expect(mine[0]).toMatchObject({ canDecide: true, lead: { id: leads.mine, name: "Entreprise mine" } })
      expect(await approvals.listApprovals(u.sdr2)).toHaveLength(0)
      await expect(approvals.decideApproval(u.sdr2, id, { approve: true })).rejects.toMatchObject({ status: 403 })
      await expect(approvals.decideApproval(u.viewer, id, { approve: true })).rejects.toMatchObject({ status: 403 })

      const view = await approvals.decideApproval(u.manager, id, { approve: true })
      expect(view).toMatchObject({ status: "APPROVED", decidedBy: "manager", canDecide: false })
      expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })).status).toBe("QUEUED")
      expect(await prisma.auditLog.count({ where: { action: "ai.approval_approved", entityId: id } })).toBe(1)
      await expect(approvals.decideApproval(u.manager, id, { approve: false })).rejects.toMatchObject({ status: 409 })
    })

    it("ends the run and releases its budget when the action is refused", async () => {
      const ctx = await runs.startRun(u.sdr, { agentId: "writer", status: "RUNNING" })
      const res = (await tools.runTool(sendTool(), { run: ctx }, { to: "x@exemple.fr" })) as { approvalId: string }
      await approvals.decideApproval(u.sdr, res.approvalId, { approve: false, note: "Mauvais destinataire" })
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })).toMatchObject({ status: "CANCELLED", reservedMicros: 0, error: "Action refusée : Mauvais destinataire" })
    })

    it("lets nobody approve an action they could not take themselves", async () => {
      const ctx = await runs.startRun(u.sdr, { agentId: "writer", status: "RUNNING" })
      const a = await prisma.agentApproval.create({ data: { workspaceId: ws, runId: ctx.id, tool: "fake", permission: "mailbox:manage", payload: {}, summary: "x", requestedById: u.sdr.id, expiresAt: new Date(Date.now() + 3600_000) } })
      await expect(approvals.decideApproval(u.manager, a.id, { approve: true })).rejects.toMatchObject({ status: 403 })
      await expect(approvals.decideApproval(u.manager, a.id, { approve: false })).resolves.toMatchObject({ status: "REJECTED" })
    })

    it("expires approvals nobody gave in time, and ends the runs waiting for them", async () => {
      const ctx = await runs.startRun(u.sdr, { agentId: "writer", status: "RUNNING" })
      const res = (await tools.runTool(sendTool(), { run: ctx }, { to: "x@exemple.fr" })) as { approvalId: string }
      await prisma.agentApproval.update({ where: { id: res.approvalId }, data: { expiresAt: new Date(Date.now() - 1000) } })
      await expect(approvals.decideApproval(u.sdr, res.approvalId, { approve: true })).rejects.toMatchObject({ status: 409 })
      expect((await prisma.agentApproval.findUniqueOrThrow({ where: { id: res.approvalId } })).status).toBe("EXPIRED")
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })).toMatchObject({ status: "EXPIRED", reservedMicros: 0 })
    })

    it("lets the requester or a manager stop a run, refusing what it waited for", async () => {
      const ctx = await runs.startRun(u.sdr, { agentId: "writer", status: "RUNNING" })
      const res = (await tools.runTool(sendTool(), { run: ctx }, { to: "x@exemple.fr" })) as { approvalId: string }
      await expect(runs.cancelRun(u.sdr2, ctx.id)).rejects.toMatchObject({ status: 403 })
      await runs.cancelRun(u.manager, ctx.id)
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })).toMatchObject({ status: "CANCELLED", reservedMicros: 0 })
      expect(await prisma.agentApproval.findUniqueOrThrow({ where: { id: res.approvalId } })).toMatchObject({ status: "REJECTED", note: "Exécution arrêtée" })
      await expect(runs.cancelRun(u.sdr, ctx.id)).rejects.toMatchObject({ status: 409 })
      const listed = await runs.listRuns(u.sdr)
      expect(listed[0]).toMatchObject({ agentLabel: "Rédacteur outreach", status: "CANCELLED", canCancel: false })
      expect(await runs.listRuns(u.sdr2)).toHaveLength(0)
      expect((await runs.listRuns(u.manager)).length).toBe(1)
    })
  })

  describe("settings", () => {
    it("lets only the owner change models and caps, merges choices and drops defaults", async () => {
      await expect(settings.updateAiSettings(u.manager, { monthlyCapEur: 50 })).rejects.toMatchObject({ status: 403 })
      // E27: another model for a role needs its evaluation on every suite the role touches.
      await expect(settings.updateAiSettings(u.owner, { roleModels: { writer: "mistral/mistral-large-4" } })).rejects.toMatchObject({ status: 409 })
      const prove = (role: "writer" | "fast", model: string, suites: ("auditor" | "offers" | "writer")[]) => proveModel(prisma, { workspaceId: ws, requestedById: u.owner.id, suites, role, baseline: role === "writer" ? "anthropic/claude-sonnet-5.5" : "anthropic/claude-haiku-5.5", model })
      await prove("writer", "mistral/mistral-large-4", ["auditor", "offers", "writer"])
      await prove("fast", "openai/gpt-6-luna", ["auditor"])
      let view = await settings.updateAiSettings(u.owner, { roleModels: { writer: "mistral/mistral-large-4" }, monthlyCapEur: 50, userDailyCapEur: 2.5 })
      expect(view.caps).toEqual({ monthlyCapEur: 50, userDailyCapEur: 2.5, eurPerUsd: 0.92 })
      expect(view.roles.find((r) => r.id === "writer")).toMatchObject({ model: "mistral/mistral-large-4", isDefault: false })
      view = await settings.updateAiSettings(u.owner, { roleModels: { fast: "openai/gpt-6-luna" } })
      expect(view.roles.find((r) => r.id === "writer")?.model).toBe("mistral/mistral-large-4")
      await settings.updateAiSettings(u.owner, { roleModels: { writer: "anthropic/claude-sonnet-5.5" } })
      expect((await prisma.aiSetting.findUniqueOrThrow({ where: { workspaceId: ws } })).roleModels).toEqual({ fast: "openai/gpt-6-luna" })
      expect(await prisma.auditLog.count({ where: { action: "ai.settings_updated" } })).toBe(3)
      expect(settings.updateAiSettingsSchema.safeParse({ monthlyCapEur: -1 }).success).toBe(false)
      expect(settings.updateAiSettingsSchema.safeParse({ roleModels: { decision: "anthropic/claude-opus-5.5" } }).success).toBe(false)
    })

    it("shows spend per person to owners and managers only", async () => {
      const day = budget.dayStart(new Date())
      await prisma.aiUsage.createMany({
        data: [
          { workspaceId: ws, day, userKey: u.sdr.id, agentId: "auditor", model: "anthropic/claude-sonnet-5.5", calls: 2, costMicros: 200_000 },
          { workspaceId: ws, day, userKey: "system", agentId: "qualifier", model: "typesafe-ai/jev", calls: 40, costMicros: 1_000 },
        ],
      })
      const owner = await settings.aiSettingsView(u.owner)
      expect(owner.month.spentEur).toBeCloseTo(0.201)
      expect(owner.month.byUser?.map((l) => l.label)).toEqual(["sdr", "Tâches planifiées"])
      expect(owner.month.byAgent[0]).toMatchObject({ label: "Auditeur digital", calls: 2 })
      const sdr = await settings.aiSettingsView(u.sdr)
      expect(sdr.month.byUser).toBeNull()
      expect(sdr.me.todayEur).toBeCloseTo(0.2)
      expect(sdr.canManage).toBe(false)
      await expect(settings.aiSettingsView(u.viewer)).resolves.toBeTruthy()
    })
  })
})
