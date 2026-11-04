import { IDENTITY_BATCH, claimIdentityBatch, runIdentityBatch } from "@/features/enrichment/identity"
import type { AnnuaireDeps } from "@/features/enrichment/sources/annuaire"
import type { BodaccDeps } from "@/features/enrichment/sources/bodacc"
import { claimSweep, ensureSweeps, runSweep } from "./sweep"
import { claimWatch, runWatch } from "./watch"

/**
 * What the worker does for the registry (E30), one piece at a time next to the agents' runs: the watches that are
 * due, then the morning sweep, then the companies still to look up in the annuaire. No model is called and nothing
 * costs: these are free public sources, read at their documented pace. Worker-safe.
 */
export type SignalWork = { kind: "watch"; id: string } | { kind: "sweep"; workspaceId: string } | { kind: "identity"; ids: string[] }

export async function claimSignalWork(workerId: string, now = new Date()): Promise<SignalWork | null> {
  const watch = await claimWatch(workerId, now)
  if (watch) return { kind: "watch", id: watch }
  await ensureSweeps(now)
  const sweep = await claimSweep(workerId, now)
  if (sweep) return { kind: "sweep", workspaceId: sweep }
  const ids = await claimIdentityBatch(IDENTITY_BATCH, now)
  return ids.length ? { kind: "identity", ids } : null
}

export interface SignalDeps {
  bodacc?: BodaccDeps
  annuaire?: AnnuaireDeps
  gapMs?: number
  signal?: AbortSignal
}

/** Runs a claimed piece and says, in a few numbers, what it did (for the worker's log). */
export async function runSignalWork(work: SignalWork, workerId: string, deps: SignalDeps = {}): Promise<Record<string, unknown>> {
  switch (work.kind) {
    case "watch": {
      const r = await runWatch(work.id, workerId, deps)
      return { watchId: work.id, notices: r?.notices ?? 0, created: r?.created ?? 0, pending: r?.pending ?? 0, error: r?.error ?? null }
    }
    case "sweep": {
      const r = await runSweep(work.workspaceId, workerId, deps)
      return { workspaceId: work.workspaceId, notices: r?.notices ?? 0, signals: r?.signals ?? 0, error: r?.error ?? null }
    }
    case "identity":
      return runIdentityBatch(work.ids, { ...deps.annuaire, gapMs: deps.gapMs, signal: deps.signal })
  }
}
