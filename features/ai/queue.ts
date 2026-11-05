import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { utc } from "@/lib/ai/sql"
import { isAgentId, type AgentId } from "./agents"

/**
 * The AI queue (E18, docs/crm-v1/AGENTS-IA.md §10). A run is its own queue entry: the CRM creates it QUEUED in the same
 * transaction that reserves its budget, so no job can be lost between the two. Workers take runs with
 * FOR UPDATE SKIP LOCKED (two workers never take the same run) and hold them with a heartbeat lease; a run whose worker
 * stopped is put back in the queue, three times at most.
 */
export const HEARTBEAT_MS = 20_000
/** Without a heartbeat for this long, the worker is considered gone. */
export const LEASE_MS = 120_000
/** Runs done during a CRM request have no heartbeat: Netlify stops them long before this. */
export const INLINE_STALE_MS = 10 * 60_000
export const MAX_ATTEMPTS = 3
/** A queued run nobody took within a day is dropped rather than run late. */
export const QUEUED_TTL_MS = 24 * 3600_000
export const WORKER_ONLINE_MS = 60_000
/** Key of the advisory lock that keeps maintenance to one worker at a time. */
export const MAINTENANCE_LOCK = 724_100_118

type Db = Prisma.TransactionClient | typeof prisma

export interface ClaimedRun {
  id: string
  agentId: AgentId
  workspaceId: string
  attempts: number
}

/** Delay before a retry: 30 s, 60 s, 120 s… up to 10 minutes. */
export const retryDelayMs = (attempt: number) => Math.min(30_000 * 2 ** Math.max(attempt - 1, 0), 10 * 60_000)

/**
 * Takes the next run this worker can handle: highest priority, then oldest; rows held by another worker are skipped.
 * `agentIds` are the agents whose behaviour this worker has; `tasks` the kinds of work it can do for any agent with a
 * free slot (a skill test runs on the agent being tested, before that agent's own behaviour ships).
 */
export async function claimNextRun(workerId: string, agentIds: readonly string[], tasks: { kinds: readonly string[]; agentIds: readonly string[] } = { kinds: [], agentIds: [] }): Promise<ClaimedRun | null> {
  if (!agentIds.length && !(tasks.kinds.length && tasks.agentIds.length)) return null
  // Times come from the application, converted like Prisma does (lib/ai/sql.ts): never NOW().
  const now = utc(new Date())
  const rows = await prisma.$queryRaw<{ id: string; agentId: string; workspaceId: string; attempts: number }[]>`
    UPDATE "AgentRun" SET "status" = 'RUNNING', "lockedBy" = ${workerId}, "heartbeatAt" = ${now}, "attempts" = "attempts" + 1,
           "startedAt" = COALESCE("startedAt", ${now}), "updatedAt" = ${now}
     WHERE "id" = (
       SELECT "id" FROM "AgentRun"
        WHERE "status" = 'QUEUED' AND ("notBefore" IS NULL OR "notBefore" <= ${now})
          AND ("agentId" = ANY(${[...agentIds]}) OR ("agentId" = ANY(${[...tasks.agentIds]}) AND "input"->>'kind' = ANY(${[...tasks.kinds]})))
        ORDER BY "priority" DESC, "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED)
 RETURNING "id", "agentId", "workspaceId", "attempts"`
  const row = rows[0]
  if (!row || !isAgentId(row.agentId)) return null
  return { id: row.id, agentId: row.agentId, workspaceId: row.workspaceId, attempts: row.attempts }
}

/** Renews the lease. False when the run is no longer this worker's (cancelled, or taken over after a stall): stop it. */
export async function heartbeat(runId: string, workerId: string): Promise<boolean> {
  const res = await prisma.agentRun.updateMany({ where: { id: runId, lockedBy: workerId, status: "RUNNING" }, data: { heartbeatAt: new Date() } })
  return res.count === 1
}

/** After a passing failure: back in the queue with a delay, or given up after MAX_ATTEMPTS (its budget is released). */
export async function retryRun(runId: string, workerId: string, reason: string): Promise<"requeued" | "failed" | "lost"> {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, lockedBy: workerId, status: "RUNNING" }, select: { attempts: true } })
  if (!run) return "lost"
  if (run.attempts >= MAX_ATTEMPTS) {
    await prisma.agentRun.updateMany({
      where: { id: runId, lockedBy: workerId, status: "RUNNING" },
      data: { status: "FAILED", finishedAt: new Date(), reservedMicros: 0, error: `Abandonnée après ${run.attempts} tentatives : ${reason}`.slice(0, 2_000) },
    })
    return "failed"
  }
  await prisma.agentRun.updateMany({
    where: { id: runId, lockedBy: workerId, status: "RUNNING" },
    data: { status: "QUEUED", lockedBy: null, heartbeatAt: null, notBefore: new Date(Date.now() + retryDelayMs(run.attempts)), error: reason.slice(0, 2_000) },
  })
  return "requeued"
}

/** On shutdown: the run goes back to the queue right away, and the interrupted try does not count. */
export async function releaseRun(runId: string, workerId: string): Promise<boolean> {
  const res = await prisma.$executeRaw`
    UPDATE "AgentRun" SET "status" = 'QUEUED', "lockedBy" = NULL, "heartbeatAt" = NULL, "attempts" = GREATEST("attempts" - 1, 0), "updatedAt" = ${utc(new Date())}
     WHERE "id" = ${runId} AND "lockedBy" = ${workerId} AND "status" = 'RUNNING'`
  return res === 1
}

/**
 * Runs whose worker stopped (lease expired) go back to the queue, or fail after MAX_ATTEMPTS. Runs started during a CRM
 * request that never finished fail: they were never the worker's to resume.
 */
export async function recoverStaleRuns(db: Db, now = new Date()): Promise<{ requeued: number; failed: number }> {
  const leaseLimit = new Date(now.getTime() - LEASE_MS)
  const inlineLimit = new Date(now.getTime() - INLINE_STALE_MS)
  const requeued = await db.agentRun.updateMany({
    where: { status: "RUNNING", lockedBy: { not: null }, heartbeatAt: { lt: leaseLimit }, attempts: { lt: MAX_ATTEMPTS } },
    data: { status: "QUEUED", lockedBy: null, heartbeatAt: null, notBefore: now, error: "Reprise après l'arrêt du worker" },
  })
  const exhausted = await db.agentRun.updateMany({
    where: { status: "RUNNING", lockedBy: { not: null }, heartbeatAt: { lt: leaseLimit }, attempts: { gte: MAX_ATTEMPTS } },
    data: { status: "FAILED", finishedAt: now, reservedMicros: 0, error: `Le worker s'est arrêté pendant l'exécution, ${MAX_ATTEMPTS} fois : abandonnée.` },
  })
  const inline = await db.agentRun.updateMany({
    where: { status: "RUNNING", lockedBy: null, OR: [{ startedAt: { lt: inlineLimit } }, { startedAt: null, createdAt: { lt: inlineLimit } }] },
    data: { status: "FAILED", finishedAt: now, reservedMicros: 0, error: "Interrompue avant la fin" },
  })
  return { requeued: requeued.count, failed: exhausted.count + inline.count }
}

/** Queued runs nobody took within a day expire instead of running late (the worker was probably down). */
export async function expireStaleQueued(db: Db, now = new Date()): Promise<number> {
  const res = await db.agentRun.updateMany({
    where: { status: "QUEUED", createdAt: { lt: new Date(now.getTime() - QUEUED_TTL_MS) } },
    data: { status: "EXPIRED", finishedAt: now, reservedMicros: 0, error: "Pas prise en charge dans les 24 heures : le worker IA était peut-être arrêté." },
  })
  return res.count
}

export interface WorkerInfo {
  id: string
  version: string
  host: string | null
  startedAt: Date
  running: number
  /** E30 lot 3: its Meta Ad Library token's state, never the token; null before its first check. */
  meta?: Prisma.InputJsonValue | null
}

/** The worker says it is alive (every few seconds). */
export async function workerBeat(info: WorkerInfo): Promise<void> {
  const now = new Date()
  const meta = info.meta === undefined ? {} : { meta: info.meta ?? Prisma.DbNull }
  await prisma.aiWorker.upsert({
    where: { id: info.id },
    create: { id: info.id, version: info.version, host: info.host, startedAt: info.startedAt, beatAt: now, running: info.running, ...meta },
    update: { version: info.version, host: info.host, startedAt: info.startedAt, beatAt: now, running: info.running, ...meta },
  })
}

export interface WorkerStatus {
  online: boolean
  lastSeen: string | null
  version: string | null
  running: number
  /** Runs waiting for a worker, across the workspace. */
  queued: number
}

export async function workerStatus(workspaceId: string, now = new Date()): Promise<WorkerStatus> {
  const [latest, queued] = await Promise.all([
    prisma.aiWorker.findFirst({ orderBy: { beatAt: "desc" } }),
    prisma.agentRun.count({ where: { workspaceId, status: "QUEUED" } }),
  ])
  const online = !!latest && now.getTime() - latest.beatAt.getTime() < WORKER_ONLINE_MS
  return { online, lastSeen: latest?.beatAt.toISOString() ?? null, version: latest?.version ?? null, running: online ? latest!.running : 0, queued }
}
