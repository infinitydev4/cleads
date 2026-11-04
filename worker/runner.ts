import os from "node:os"
import { prisma } from "@/lib/prisma"
import { publishRunUpdate, type RunUpdate } from "@/lib/ai/realtime"
import { withActing } from "@/lib/ai/acting"
import { LeadError } from "@/features/leads/errors"
import { AGENT_IDS, type AgentId } from "@/features/ai/agents"
import { RetryableError, agentHandler, handledAgents, handledTasks, taskHandler } from "@/features/ai/handlers"
import { runMaintenance } from "@/features/ai/maintenance"
import { HEARTBEAT_MS, claimNextRun, heartbeat, releaseRun, retryRun, workerBeat, type ClaimedRun } from "@/features/ai/queue"
import { finishRun, loadRunContext } from "@/features/ai/runs"
import { effectiveAgent } from "@/features/ai/definitions"
import { executeApprovedCalls } from "@/features/ai/tools"
import { advanceMission, claimMission } from "@/features/missions/engine"
import { claimSignalWork, runSignalWork } from "@/features/signals/engine"
import { errorFields, log } from "./log"

/**
 * The AI worker (E18, docs/crm-v1/AGENTS-IA.md §10): takes queued runs, runs their agent, and keeps the queue healthy.
 * One process can run several runs at once, within a global limit and a limit per agent.
 */
export interface WorkerConfig {
  id: string
  version: string
  concurrency: number
  /** Most runs of one agent at once; the others are limited by `concurrency` only. */
  perAgent: Partial<Record<AgentId, number>>
  pollIdleMs: number
  pollBusyMs: number
  maintenanceMs: number
  beatMs: number
  /** Lease renewal; HEARTBEAT_MS by default. */
  heartbeatMs?: number
  /** E28: missions advanced at once; 2 by default. */
  missionConcurrency?: number
  /**
   * E30: how often the worker looks for registry work (watches, the morning sweep, identity lookups), one piece at a
   * time. Off when unset.
   */
  signalsEveryMs?: number
}

/** The Studio and audits are heavy (browser, long generations): fewer at once. */
export const DEFAULT_PER_AGENT: Partial<Record<AgentId, number>> = { designer: 1, auditor: 2, strategist: 1, qualifier: 1, researcher: 2 }

export interface WorkerDeps {
  publish?: (update: RunUpdate) => Promise<void>
}

interface Running {
  agentId: AgentId
  controller: AbortController
  done: Promise<void>
}

const PRISMA_CONNECTION_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"])

/** Passing failures: the run is tried again later. Anything else ends it. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof RetryableError) return true
  if (error instanceof LeadError) return error.code === "unavailable"
  const e = error as { code?: unknown; name?: unknown } | null
  return (typeof e?.code === "string" && PRISMA_CONNECTION_CODES.has(e.code)) || e?.name === "PrismaClientInitializationError"
}

/** What the person sees on a failed run: business messages as they are, nothing internal. */
export const publicMessage = (error: unknown) =>
  error instanceof LeadError || error instanceof RetryableError ? error.message : "Erreur interne du worker IA (détail dans ses journaux)."

export class AgentWorker {
  readonly startedAt = new Date()
  private readonly running = new Map<string, Running>()
  private readonly missions = new Map<string, { controller: AbortController; done: Promise<void> }>()
  private signalWork: { controller: AbortController; done: Promise<void> } | null = null
  private lastSignalCheck = 0
  private stopping = false
  private loopTimer: NodeJS.Timeout | null = null
  private intervals: NodeJS.Timeout[] = []
  lastTickAt: Date | null = null
  lastMaintenanceAt: Date | null = null
  lastError: string | null = null

  constructor(
    private readonly cfg: WorkerConfig,
    private readonly deps: WorkerDeps = {}
  ) {}

  get size() {
    return this.running.size
  }

  /** Resolves when the runs in progress have ended. */
  async idle(): Promise<void> {
    await Promise.all([...this.running.values(), ...this.missions.values(), ...(this.signalWork ? [this.signalWork] : [])].map((r) => r.done))
  }

  /** Agents with a free slot on this worker. */
  private freeAgents(): AgentId[] {
    const counts = new Map<AgentId, number>()
    for (const r of this.running.values()) counts.set(r.agentId, (counts.get(r.agentId) ?? 0) + 1)
    return AGENT_IDS.filter((id) => (counts.get(id) ?? 0) < (this.cfg.perAgent[id] ?? this.cfg.concurrency))
  }

  /** Takes runs until the worker is full; returns how many it started. */
  async tick(): Promise<number> {
    this.lastTickAt = new Date()
    let started = 0
    while (!this.stopping && this.running.size < this.cfg.concurrency) {
      const free = this.freeAgents()
      const handled = new Set(handledAgents())
      const claim = await claimNextRun(
        this.cfg.id,
        free.filter((id) => handled.has(id)),
        { kinds: handledTasks(), agentIds: free }
      )
      if (!claim) break
      const controller = new AbortController()
      const done = this.execute(claim, controller).finally(() => this.running.delete(claim.id))
      this.running.set(claim.id, { agentId: claim.agentId, controller, done })
      started++
    }
    return started
  }

  /**
   * E28: advances the missions that are due (features/missions/engine.ts), a few at a time, next to the runs: a pass
   * waits on nothing long, it launches work and gives the mission back.
   */
  async tickMissions(): Promise<number> {
    let started = 0
    while (!this.stopping && this.missions.size < (this.cfg.missionConcurrency ?? 2)) {
      const id = await claimMission(this.cfg.id)
      if (!id) break
      const controller = new AbortController()
      const done = advanceMission(id, { workerId: this.cfg.id, signal: controller.signal })
        .catch((error) => log("error", "mission pass failed", { missionId: id, ...errorFields(error) }))
        .finally(() => this.missions.delete(id))
      this.missions.set(id, { controller, done })
      started++
    }
    return started
  }

  /**
   * E30: one piece of registry work at a time (features/signals/engine.ts), so the annuaire is read at its pace. While
   * there is work, the next piece is looked for at once; otherwise after `signalsEveryMs`.
   */
  async tickSignals(now = Date.now()): Promise<number> {
    const every = this.cfg.signalsEveryMs
    if (!every || this.stopping || this.signalWork || now - this.lastSignalCheck < every) return 0
    this.lastSignalCheck = now
    const work = await claimSignalWork(this.cfg.id)
    if (!work) return 0
    const controller = new AbortController()
    const done = runSignalWork(work, this.cfg.id, { signal: controller.signal })
      .then((result) => log("info", "registry work", { kind: work.kind, ...result }))
      .catch((error) => log("error", "registry work failed", { kind: work.kind, ...errorFields(error) }))
      .finally(() => {
        this.signalWork = null
        this.lastSignalCheck = 0
      })
    this.signalWork = { controller, done }
    return 1
  }

  private async publish(runId: string) {
    const run = await prisma.agentRun.findUnique({ where: { id: runId }, select: { id: true, agentId: true, status: true, requestedById: true, leadId: true } }).catch(() => null)
    if (run) await (this.deps.publish ?? publishRunUpdate)(run)
  }

  /** Runs one claimed run to its end, whatever happens; never throws. */
  async execute(claim: ClaimedRun, controller = new AbortController()): Promise<void> {
    const me = this.cfg.id
    const lease = setInterval(() => {
      heartbeat(claim.id, me)
        .then((ok) => {
          if (!ok) controller.abort()
        })
        .catch((error) => log("warn", "heartbeat failed", { runId: claim.id, ...errorFields(error) }))
    }, this.cfg.heartbeatMs ?? HEARTBEAT_MS)
    const fail = (error: string) => finishRun(claim.id, { status: "FAILED", lockedBy: me, error })
    log("info", "run started", { runId: claim.id, agentId: claim.agentId, attempt: claim.attempts })
    try {
      await this.publish(claim.id)
      const ctx = await loadRunContext(claim.id)
      // The agent's rights matrix of now, as the owner set it (E28): an approved call of a family cut since stays undone.
      const approved = await executeApprovedCalls({ run: ctx, policy: (await effectiveAgent(ctx.workspaceId, ctx.agentId)).policy })
      if (approved.uncertain.length) {
        await fail(`L'action « ${approved.uncertain[0].tool} » a peut-être déjà été faite : le worker s'est arrêté pendant son exécution. Vérifiez avant de la relancer.`)
        return
      }
      if (approved.failed.length) {
        await fail(`L'action approuvée « ${approved.failed[0].tool} » a échoué : ${approved.failed[0].error}`.slice(0, 2_000))
        return
      }
      const row = await prisma.agentRun.findUnique({ where: { id: claim.id }, select: { input: true } })
      const input = row?.input ?? null
      // A task (a skill test) runs the same way for every agent; otherwise the agent's own behaviour.
      const handler = taskHandler(input) ?? agentHandler(claim.agentId)
      if (!handler) {
        await fail("Cet agent n'est pas encore disponible sur le worker.")
        return
      }
      const job = { run: ctx, attempt: claim.attempts, input, approved: approved.done, signal: controller.signal }
      // A mission's run: what it starts (Jev's next batch) works for the same mission (E28).
      const result = ctx.missionId ? await withActing({ agentId: claim.agentId, runId: claim.id, missionId: ctx.missionId }, () => handler(job)) : await handler(job)
      if (controller.signal.aborted) return
      // A handler that asked for approval left the run waiting; one that ran out of budget already ended it.
      const state = await prisma.agentRun.findUnique({ where: { id: claim.id }, select: { status: true, lockedBy: true } })
      if (state?.status === "RUNNING" && state.lockedBy === me) {
        await finishRun(claim.id, { status: "SUCCEEDED", lockedBy: me, ...(result && "output" in result ? { output: result.output } : {}) })
      }
      log("info", "run ended", { runId: claim.id, status: state?.status === "RUNNING" ? "SUCCEEDED" : state?.status })
    } catch (error) {
      if (controller.signal.aborted) {
        log("info", "run stopped: cancelled or taken over", { runId: claim.id })
      } else if (isRetryable(error)) {
        const outcome = await retryRun(claim.id, me, publicMessage(error)).catch(() => "lost")
        log("warn", "run failed, retry", { runId: claim.id, outcome, ...errorFields(error) })
      } else {
        await fail(publicMessage(error)).catch(() => false)
        log("error", "run failed", { runId: claim.id, agentId: claim.agentId, ...errorFields(error) })
      }
    } finally {
      clearInterval(lease)
      await this.publish(claim.id).catch(() => undefined)
    }
  }

  async maintenance(): Promise<void> {
    try {
      const report = await runMaintenance()
      this.lastMaintenanceAt = new Date()
      if (report && Object.values(report).some((n) => n > 0)) log("info", "maintenance", { ...report })
    } catch (error) {
      log("error", "maintenance failed", errorFields(error))
    }
  }

  async beat(): Promise<void> {
    try {
      await workerBeat({ id: this.cfg.id, version: this.cfg.version, host: os.hostname(), startedAt: this.startedAt, running: this.running.size })
    } catch (error) {
      log("warn", "beat failed", errorFields(error))
    }
  }

  start(): void {
    const loop = async () => {
      if (this.stopping) return
      let started = 0
      try {
        started = await this.tick()
        started += await this.tickMissions()
        started += await this.tickSignals()
        this.lastError = null
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error)
        log("error", "claim failed", errorFields(error))
      }
      if (!this.stopping) this.loopTimer = setTimeout(loop, started > 0 ? this.cfg.pollBusyMs : this.cfg.pollIdleMs)
    }
    void this.beat()
    void this.maintenance()
    void loop()
    this.intervals.push(setInterval(() => void this.maintenance(), this.cfg.maintenanceMs), setInterval(() => void this.beat(), this.cfg.beatMs))
  }

  /**
   * Stops taking runs, waits for the ones in progress, then puts the others back in the queue (their interrupted try
   * does not count) so the next worker resumes them.
   */
  async stop(graceMs: number): Promise<void> {
    this.stopping = true
    if (this.loopTimer) clearTimeout(this.loopTimer)
    for (const t of this.intervals) clearInterval(t)
    // A mission's pass ends after the step in progress and gives the mission back.
    for (const m of this.missions.values()) m.controller.abort()
    this.signalWork?.controller.abort()
    const all = Promise.all([...this.running.values(), ...this.missions.values(), ...(this.signalWork ? [this.signalWork] : [])].map((r) => r.done))
    await Promise.race([all, new Promise((resolve) => setTimeout(resolve, graceMs))])
    for (const [runId, r] of this.running) {
      r.controller.abort()
      const released = await releaseRun(runId, this.cfg.id).catch(() => false)
      log("warn", "run released on shutdown", { runId, released })
    }
    await this.beat()
  }

  /** For the health endpoint: alive when the claim loop ran recently. */
  health(now = new Date()) {
    const staleAfter = Math.max(this.cfg.pollIdleMs * 3, 30_000)
    const ok = !this.stopping && !!this.lastTickAt && now.getTime() - this.lastTickAt.getTime() < staleAfter
    return {
      ok,
      version: this.cfg.version,
      running: this.running.size,
      missions: this.missions.size,
      agents: handledAgents(),
      tasks: handledTasks(),
      lastTickAt: this.lastTickAt?.toISOString() ?? null,
      lastMaintenanceAt: this.lastMaintenanceAt?.toISOString() ?? null,
      lastError: this.lastError,
    }
  }
}
