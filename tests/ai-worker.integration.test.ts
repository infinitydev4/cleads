// E18 AI worker. Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/ai-worker.integration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("AI worker (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let runs: typeof import("@/features/ai/runs")
  let queue: typeof import("@/features/ai/queue")
  let handlers: typeof import("@/features/ai/handlers")
  let tools: typeof import("@/features/ai/tools")
  let approvals: typeof import("@/features/ai/approvals")
  let maintenance: typeof import("@/features/ai/maintenance")
  let runner: typeof import("@/worker/runner")
  let LeadError: typeof import("@/features/leads/errors").LeadError
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let leadId = ""
  let published: { id: string; status: string }[] = []

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    runs = await import("@/features/ai/runs")
    queue = await import("@/features/ai/queue")
    handlers = await import("@/features/ai/handlers")
    tools = await import("@/features/ai/tools")
    approvals = await import("@/features/ai/approvals")
    maintenance = await import("@/features/ai/maintenance")
    runner = await import("@/worker/runner")
    LeadError = (await import("@/features/leads/errors")).LeadError
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    handlers.clearAgentHandlers()
    tools.clearTools()
    published = []
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@worker.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
    const c = await prisma.company.create({ data: { workspaceId: ws, name: "Plomberie Martin" } })
    leadId = (await prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, ownerId: u.sdr.id } })).id
  })

  const worker = (id = "w1", extra: Partial<import("@/worker/runner").WorkerConfig> = {}) =>
    new runner.AgentWorker(
      { id, version: "test", concurrency: 3, perAgent: {}, pollIdleMs: 50, pollBusyMs: 10, maintenanceMs: 60_000, beatMs: 60_000, heartbeatMs: 40, ...extra },
      { publish: async (update) => void published.push({ id: update.id, status: update.status }) }
    )
  const status = async (id: string) => (await prisma.agentRun.findUniqueOrThrow({ where: { id } })).status
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  it("takes queued runs by priority then age, each once, even with several workers asking at the same time", async () => {
    const a = await runs.startRun(u.owner, { agentId: "writer" })
    const b = await runs.startRun(u.owner, { agentId: "writer", priority: 5 })
    const c = await runs.startRun(u.owner, { agentId: "writer" })
    const later = await runs.startRun(u.owner, { agentId: "writer" })
    await prisma.agentRun.update({ where: { id: later.id }, data: { notBefore: new Date(Date.now() + 60_000) } })
    const claims = await Promise.all(Array.from({ length: 6 }, (_, i) => queue.claimNextRun(`w${i}`, ["writer"])))
    const taken = claims.filter((x) => x !== null)
    expect(taken.map((x) => x!.id).sort()).toEqual([a.id, b.id, c.id].sort())
    const first = await queue.claimNextRun("w9", ["writer"])
    expect(first).toBeNull()
    const row = await prisma.agentRun.findUniqueOrThrow({ where: { id: b.id } })
    expect(row).toMatchObject({ status: "RUNNING", attempts: 1 })
    expect(row.lockedBy).toMatch(/^w\d$/)
    expect(await queue.claimNextRun("w9", [])).toBeNull()
  })

  it("lets one run of an agent work on a fiche at a time", async () => {
    const first = await runs.startRun(u.sdr, { agentId: "auditor", leadId })
    await expect(runs.startRun(u.sdr, { agentId: "auditor", leadId })).rejects.toMatchObject({ code: "conflict", status: 409 })
    await expect(runs.startRun(u.sdr, { agentId: "writer", leadId })).resolves.toBeTruthy()
    await runs.finishRun(first.id, { status: "SUCCEEDED" })
    await expect(runs.startRun(u.sdr, { agentId: "auditor", leadId })).resolves.toBeTruthy()
  })

  it("runs a handler to the end, keeps its output, releases the budget and announces each change", async () => {
    handlers.registerAgentHandler("writer", async (job) => ({ output: { draft: `Bonjour ${(job.input as { name: string }).name}`, attempt: job.attempt } }))
    const ctx = await runs.startRun(u.sdr, { agentId: "writer", input: { name: "Martin" } })
    const w = worker()
    expect(await w.tick()).toBe(1)
    await w.idle()
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })
    expect(run).toMatchObject({ status: "SUCCEEDED", reservedMicros: 0, lockedBy: "w1", output: { draft: "Bonjour Martin", attempt: 1 } })
    expect(published).toEqual([
      { id: ctx.id, status: "RUNNING" },
      { id: ctx.id, status: "SUCCEEDED" },
    ])
  })

  it("only takes agents it has a handler for, within each agent's limit", async () => {
    handlers.registerAgentHandler("designer", async () => {
      await sleep(80)
      return {}
    })
    await runs.startRun(u.owner, { agentId: "designer" })
    await runs.startRun(u.owner, { agentId: "designer" })
    const auditor = await runs.startRun(u.owner, { agentId: "auditor" })
    const w = worker("w1", { perAgent: { designer: 1 } })
    expect(await w.tick()).toBe(1)
    expect(w.size).toBe(1)
    await w.idle()
    expect(await w.tick()).toBe(1)
    await w.idle()
    expect(await status(auditor.id)).toBe("QUEUED")
  })

  it("retries passing failures later, then gives up after three tries", async () => {
    handlers.registerAgentHandler("writer", async () => {
      throw new handlers.RetryableError("Le fournisseur ne répond pas")
    })
    const ctx = await runs.startRun(u.sdr, { agentId: "writer" })
    const w = worker()
    await w.tick()
    await w.idle()
    let run = await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })
    expect(run).toMatchObject({ status: "QUEUED", attempts: 1, lockedBy: null, error: "Le fournisseur ne répond pas" })
    expect(run.notBefore!.getTime()).toBeGreaterThan(Date.now() + 20_000)
    await prisma.agentRun.update({ where: { id: ctx.id }, data: { notBefore: null, attempts: 2 } })
    await w.tick()
    await w.idle()
    run = await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })
    expect(run).toMatchObject({ status: "FAILED", reservedMicros: 0 })
    expect(run.error).toContain("Abandonnée après 3 tentatives")
  })

  it("ends a run on other errors without showing internals", async () => {
    handlers.registerAgentHandler("writer", async () => {
      throw new Error("connection string postgres://secret@host")
    })
    handlers.registerAgentHandler("offers", async () => {
      throw new LeadError("invalid", "La fiche n'a pas d'audit.")
    })
    const a = await runs.startRun(u.sdr, { agentId: "writer" })
    const b = await runs.startRun(u.sdr, { agentId: "offers" })
    const w = worker()
    await w.tick()
    await w.idle()
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: a.id } })).error).toBe("Erreur interne du worker IA (détail dans ses journaux).")
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: b.id } })).error).toBe("La fiche n'a pas d'audit.")
  })

  describe("approved actions", () => {
    let executed = 0
    const sendTool = () =>
      tools.defineTool({
        name: "send_test",
        description: "Envoie un email",
        permission: "email:send",
        approval: "user",
        costClass: "external",
        input: z.object({ to: z.string() }),
        summarize: (i) => `Envoyer un email à ${i.to}`,
        execute: async (_ctx, i) => {
          executed++
          return { sentTo: i.to }
        },
      })

    beforeEach(() => {
      executed = 0
    })

    it("waits for a person, then resumes with the approved result and executes the action once", async () => {
      const send = sendTool()
      tools.registerTool(send)
      handlers.registerAgentHandler("writer", async (job) => {
        if (!job.approved.length) {
          await tools.runTool(send, { run: job.run }, { to: "client@exemple.fr" })
          return
        }
        return { output: { done: job.approved[0].output } }
      })
      const ctx = await runs.startRun(u.sdr, { agentId: "writer" })
      const w = worker()
      await w.tick()
      await w.idle()
      expect(await status(ctx.id)).toBe("WAITING_APPROVAL")
      expect(executed).toBe(0)

      const pending = await prisma.agentApproval.findFirstOrThrow({ where: { runId: ctx.id } })
      await approvals.decideApproval(u.sdr, pending.id, { approve: true })
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })).toMatchObject({ status: "QUEUED", attempts: 0, priority: 1 })

      await w.tick()
      await w.idle()
      expect(executed).toBe(1)
      const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })
      expect(run).toMatchObject({ status: "SUCCEEDED", output: { done: { sentTo: "client@exemple.fr" } } })
      const done = await prisma.agentApproval.findUniqueOrThrow({ where: { id: pending.id } })
      expect(done.executedAt).not.toBeNull()
      expect(done.result).toEqual({ output: { sentTo: "client@exemple.fr" } })

      // Run again by mistake: the action is not done twice.
      await prisma.agentRun.update({ where: { id: ctx.id }, data: { status: "QUEUED", finishedAt: null } })
      await w.tick()
      await w.idle()
      expect(executed).toBe(1)
    })

    it("never repeats an approved action that may have started before a crash", async () => {
      tools.registerTool(sendTool())
      handlers.registerAgentHandler("writer", async () => ({ output: "should not run" }))
      const ctx = await runs.startRun(u.sdr, { agentId: "writer" })
      await prisma.agentApproval.create({
        data: { workspaceId: ws, runId: ctx.id, tool: "send_test", permission: "email:send", payload: { to: "x@exemple.fr" }, summary: "x", status: "APPROVED", requestedById: u.sdr.id, expiresAt: new Date(Date.now() + 3600_000), executionStartedAt: new Date() },
      })
      const w = worker()
      await w.tick()
      await w.idle()
      expect(executed).toBe(0)
      const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })
      expect(run.status).toBe("FAILED")
      expect(run.error).toContain("a peut-être déjà été faite")
    })
  })

  it("stops a run that a person cancelled, and leaves it cancelled", async () => {
    let aborted = false
    handlers.registerAgentHandler("writer", async (job) => {
      await new Promise<void>((resolve) => {
        job.signal.addEventListener("abort", () => resolve())
        setTimeout(resolve, 3_000)
      })
      aborted = job.signal.aborted
      return { output: "too late" }
    })
    const ctx = await runs.startRun(u.sdr, { agentId: "writer" })
    const w = worker()
    await w.tick()
    await sleep(30)
    await runs.cancelRun(u.sdr, ctx.id)
    await w.idle()
    expect(aborted).toBe(true)
    expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })).toMatchObject({ status: "CANCELLED", output: null })
  })

  it("puts unfinished runs back in the queue on shutdown, without counting the try", async () => {
    handlers.registerAgentHandler("writer", (job) => new Promise((resolve) => job.signal.addEventListener("abort", () => resolve({}))))
    const ctx = await runs.startRun(u.sdr, { agentId: "writer" })
    const w = worker()
    await w.tick()
    await w.stop(50)
    expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id } })).toMatchObject({ status: "QUEUED", attempts: 0, lockedBy: null })
    expect(w.health().ok).toBe(false)
  })

  describe("maintenance", () => {
    it("resumes the runs of a stopped worker, gives up after three tries, fails interrupted requests, expires old queued runs", async () => {
      const ago = (ms: number) => new Date(Date.now() - ms)
      const stalled = await runs.startRun(u.owner, { agentId: "writer" })
      const exhausted = await runs.startRun(u.owner, { agentId: "writer" })
      const inline = await runs.startRun(u.owner, { agentId: "writer", status: "RUNNING" })
      const old = await runs.startRun(u.owner, { agentId: "writer" })
      const fresh = await runs.startRun(u.owner, { agentId: "writer" })
      await prisma.agentRun.update({ where: { id: stalled.id }, data: { status: "RUNNING", lockedBy: "gone", heartbeatAt: ago(5 * 60_000), attempts: 1 } })
      await prisma.agentRun.update({ where: { id: exhausted.id }, data: { status: "RUNNING", lockedBy: "gone", heartbeatAt: ago(5 * 60_000), attempts: 3 } })
      await prisma.agentRun.update({ where: { id: inline.id }, data: { startedAt: ago(20 * 60_000) } })
      await prisma.agentRun.update({ where: { id: old.id }, data: { createdAt: ago(2 * 24 * 3600_000) } })

      const report = await maintenance.runMaintenance()
      expect(report).toMatchObject({ requeued: 1, failed: 2, expiredQueued: 1 })
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: stalled.id } })).toMatchObject({ status: "QUEUED", lockedBy: null })
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: exhausted.id } })).toMatchObject({ status: "FAILED", reservedMicros: 0 })
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: inline.id } })).toMatchObject({ status: "FAILED", error: "Interrompue avant la fin" })
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ status: "EXPIRED", reservedMicros: 0 })
      expect(await status(fresh.id)).toBe("QUEUED")
    })

    it("runs on one worker at a time", async () => {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${queue.MAINTENANCE_LOCK})`
        expect(await maintenance.runMaintenance()).toBeNull()
      })
      expect(await maintenance.runMaintenance()).not.toBeNull()
    })

    it("tells the owners when several runs fail, once an hour", async () => {
      handlers.registerAgentHandler("writer", async () => {
        throw new Error("boom")
      })
      for (let i = 0; i < 3; i++) await runs.startRun(u.owner, { agentId: "writer" })
      const w = worker()
      await w.tick()
      await w.idle()
      expect((await maintenance.runMaintenance())?.alerts).toBe(1)
      expect((await maintenance.runMaintenance())?.alerts).toBe(0)
      expect(await prisma.notification.count({ where: { userId: u.owner.id, title: "Agents IA : exécutions en échec" } })).toBe(1)
      expect(await prisma.notification.count({ where: { userId: u.manager.id } })).toBe(0)
    })
  })

  it("shows in Réglages › IA whether a worker is up, and what waits for it", async () => {
    expect(await queue.workerStatus(ws)).toMatchObject({ online: false, lastSeen: null, queued: 0 })
    await runs.startRun(u.owner, { agentId: "writer" })
    const w = worker("ai-worker-1")
    await w.beat()
    expect(await queue.workerStatus(ws)).toMatchObject({ online: true, version: "test", running: 0, queued: 1 })
    await prisma.aiWorker.update({ where: { id: "ai-worker-1" }, data: { beatAt: new Date(Date.now() - 5 * 60_000) } })
    expect((await queue.workerStatus(ws)).online).toBe(false)
  })

  it("classifies errors: passing failures are retried, everything else ends the run", () => {
    expect(runner.isRetryable(new handlers.RetryableError("x"))).toBe(true)
    expect(runner.isRetryable(new LeadError("unavailable", "x", 503))).toBe(true)
    expect(runner.isRetryable(new LeadError("budget_exceeded", "x", 429))).toBe(false)
    expect(runner.isRetryable(Object.assign(new Error("db"), { code: "P1001" }))).toBe(true)
    expect(runner.isRetryable(new Error("bug"))).toBe(false)
    expect(queue.retryDelayMs(1)).toBe(30_000)
    expect(queue.retryDelayMs(3)).toBe(120_000)
    expect(queue.retryDelayMs(20)).toBe(600_000)
  })
})
