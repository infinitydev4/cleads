import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { utc } from "@/lib/ai/sql"
import { addDays, dayKey } from "@/lib/crm/day"
import { FAMILIES, fetchNotices, type BodaccDeps } from "@/features/enrichment/sources/bodacc"
import { PURGE_DAYS, SIGNAL_LABELS, signalsOf } from "./kinds"
import { companiesBySiren, notify, saveSignals } from "./store"
import { nextMorning } from "./watch"

/**
 * The morning sweep (E30): every BODACC notice of the last days, all of France, matched by SIREN with the workspace's
 * companies. A takeover, a new leader, a move or proceedings become a signal on the fiche and a note to its owner;
 * proceedings and closures also set the legal state, which stops prospecting (D49). Signals older than a year go.
 * Today's notices may still be arriving: the sweep reads the last day again the next morning. Worker-safe.
 */
export const MAX_SWEEP_DAYS = 3
const LOCK_MS = 30 * 60_000

export interface SweepReport {
  at: string
  from: string
  to: string
  notices: number
  signals: number
  byKind: Record<string, number>
  purged: number
  truncatedDays: string[]
  error?: string
}

/** Every workspace has its sweep row, due at the next morning. */
export async function ensureSweeps(now = new Date()): Promise<void> {
  await prisma.$executeRaw`INSERT INTO "SignalSweep" ("workspaceId", "nextRunAt") SELECT "id", ${utc(nextMorning(now))} FROM "Workspace" ON CONFLICT DO NOTHING`
}

export async function claimSweep(workerId: string, now = new Date()): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ workspaceId: string }[]>`
    UPDATE "SignalSweep" SET "lockedBy" = ${workerId}, "lockedAt" = ${utc(now)}
     WHERE "workspaceId" = (
       SELECT "workspaceId" FROM "SignalSweep"
        WHERE "nextRunAt" <= ${utc(now)} AND ("lockedAt" IS NULL OR "lockedAt" < ${utc(new Date(now.getTime() - LOCK_MS))})
        ORDER BY "nextRunAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED)
 RETURNING "workspaceId"`
  return rows[0]?.workspaceId ?? null
}

export async function runSweep(workspaceId: string, workerId: string, deps: { bodacc?: BodaccDeps; signal?: AbortSignal } = {}, now = new Date()): Promise<SweepReport | null> {
  const row = await prisma.signalSweep.findUnique({ where: { workspaceId } })
  if (!row || row.lockedBy !== workerId) return null
  const today = dayKey(now)
  const oldest = addDays(today, -(MAX_SWEEP_DAYS - 1))
  const last = row.cursorDay ? row.cursorDay.toISOString().slice(0, 10) : addDays(today, -1)
  const from = last < oldest ? oldest : last
  const report: SweepReport = { at: now.toISOString(), from, to: today, notices: 0, signals: 0, byKind: {}, purged: 0, truncatedDays: [] }
  const release = (data: Prisma.SignalSweepUpdateInput) =>
    prisma.signalSweep.updateMany({ where: { workspaceId, lockedBy: workerId }, data: { ...data, lockedBy: null, lockedAt: null, lastRunAt: now, lastReport: report as unknown as Prisma.InputJsonValue } })
  try {
    // Day by day: a busy day holds about 8 000 notices, under Opendatasoft's limit of 10 000 per query.
    for (let day = from; day <= today; day = addDays(day, 1)) {
      if (deps.signal?.aborted) throw new Error("Interrompu")
      const { notices, truncated } = await fetchNotices({ families: FAMILIES, from: day, to: day }, { ...deps.bodacc, signal: deps.signal })
      if (truncated) report.truncatedDays.push(day)
      report.notices += notices.length
      const drafts = notices.flatMap(signalsOf)
      const companies = await companiesBySiren(workspaceId, [...new Set(drafts.map((d) => d.siren))])
      const saved = await saveSignals(workspaceId, drafts.filter((d) => companies.has(d.siren)), companies)
      report.signals += saved.length
      for (const s of saved) report.byKind[s.kind] = (report.byKind[s.kind] ?? 0) + 1
      await tellOwners(workspaceId, saved)
    }
    const purged = await prisma.companySignal.deleteMany({ where: { workspaceId, occurredAt: { lt: new Date(now.getTime() - PURGE_DAYS * 86_400_000) } } })
    report.purged = purged.count
    await release({ cursorDay: new Date(`${today}T00:00:00Z`), nextRunAt: nextMorning(now) })
  } catch (error) {
    report.error = error instanceof Error ? error.message : "Erreur inconnue"
    await release({ nextRunAt: new Date(now.getTime() + 3600_000) })
  }
  return report
}

/** One note per person, naming their fiches that received a signal. */
async function tellOwners(workspaceId: string, saved: { companyId: string; kind: keyof typeof SIGNAL_LABELS }[]): Promise<void> {
  if (!saved.length) return
  const leads = await prisma.lead.findMany({ where: { workspaceId, companyId: { in: [...new Set(saved.map((s) => s.companyId))] }, ownerId: { not: null } }, select: { ownerId: true, companyId: true, company: { select: { name: true } } } })
  const byOwner = new Map<string, string[]>()
  for (const l of leads) {
    const kinds = [...new Set(saved.filter((s) => s.companyId === l.companyId).map((s) => SIGNAL_LABELS[s.kind].toLowerCase()))]
    byOwner.set(l.ownerId!, [...(byOwner.get(l.ownerId!) ?? []), `${l.company?.name ?? "Entreprise"} (${kinds.join(", ")})`])
  }
  for (const [ownerId, items] of byOwner) {
    await notify([ownerId], { title: items.length > 1 ? `${items.length} fiches ont un nouveau signal` : "Nouveau signal sur une fiche", message: `${items.slice(0, 5).join(" ; ")}${items.length > 5 ? "…" : ""}. Source : BODACC.` })
  }
}
