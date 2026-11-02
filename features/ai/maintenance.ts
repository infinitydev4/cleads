import { prisma } from "@/lib/prisma"
import { expireApprovals } from "./approvals"
import { MAINTENANCE_LOCK, expireStaleQueued, recoverStaleRuns } from "./queue"
import { sweepTriage } from "@/features/reply-triage/handler"
import { purgeStudio } from "@/features/studio/purge"

/**
 * Housekeeping of the AI queue, run by the worker every 30 seconds. An advisory lock keeps it to one worker at a time
 * when several run; the others skip the pass.
 */
export interface MaintenanceReport {
  requeued: number
  failed: number
  expiredQueued: number
  expiredApprovals: number
  alerts: number
  /** E22: fiches whose waiting replies were queued again for filing. */
  triageQueued: number
  /** E23: Studio sites whose content was deleted after 90 days. */
  sitesPurged: number
}

const FAILURE_WINDOW_MS = 15 * 60_000
const FAILURE_ALERT_THRESHOLD = 3
const FAILURE_ALERT_TITLE = "Agents IA : exécutions en échec"

/** Tells the owners when several worker runs failed recently, at most once an hour per workspace. */
async function failureAlerts(now: Date): Promise<number> {
  const since = new Date(now.getTime() - FAILURE_WINDOW_MS)
  const failing = await prisma.agentRun.groupBy({
    by: ["workspaceId"],
    where: { status: "FAILED", lockedBy: { not: null }, finishedAt: { gte: since } },
    _count: { _all: true },
  })
  let sent = 0
  for (const w of failing) {
    if (w._count._all < FAILURE_ALERT_THRESHOLD) continue
    const owners = await prisma.user.findMany({ where: { workspaceId: w.workspaceId, role: "OWNER", active: true }, select: { id: true } })
    if (!owners.length) continue
    const recent = await prisma.notification.count({
      where: { userId: { in: owners.map((o) => o.id) }, title: FAILURE_ALERT_TITLE, createdAt: { gte: new Date(now.getTime() - 3600_000) } },
    })
    if (recent) continue
    await prisma.notification.createMany({
      data: owners.map((o) => ({
        userId: o.id,
        type: "SYSTEM",
        title: FAILURE_ALERT_TITLE,
        message: `${w._count._all} exécutions ont échoué en 15 minutes. Détail dans Réglages › IA ; les journaux du worker sont sur le VPS.`,
      })),
    })
    sent += owners.length
  }
  return sent
}

/** One pass. Null when another worker holds the lock. */
export async function runMaintenance(now = new Date()): Promise<MaintenanceReport | null> {
  const report = await prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${MAINTENANCE_LOCK}) AS "locked"`
      if (!locked) return null
      const stale = await recoverStaleRuns(tx, now)
      const expiredQueued = await expireStaleQueued(tx, now)
      const expiredApprovals = await expireApprovals(now, tx)
      await tx.aiWorker.deleteMany({ where: { beatAt: { lt: new Date(now.getTime() - 7 * 24 * 3600_000) } } })
      return { requeued: stale.requeued, failed: stale.failed, expiredQueued, expiredApprovals, alerts: 0, triageQueued: 0, sitesPurged: 0 }
    },
    { timeout: 20_000 }
  )
  if (report) {
    report.alerts = await failureAlerts(now)
    report.triageQueued = await sweepTriage(now)
    report.sitesPurged = (await purgeStudio(now)).purged
  }
  return report
}
