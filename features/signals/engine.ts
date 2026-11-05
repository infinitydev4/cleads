import { IDENTITY_BATCH, claimIdentityBatch, runIdentityBatch } from "@/features/enrichment/identity"
import type { AnnuaireDeps } from "@/features/enrichment/sources/annuaire"
import type { BodaccDeps } from "@/features/enrichment/sources/bodacc"
import { ADS_BATCH, adsReady, claimAdsBatch, runAdsBatch, type AdsDeps } from "./ads"
import { claimSweep, ensureSweeps, runSweep } from "./sweep"
import { claimWatch, runWatch } from "./watch"

/**
 * What the worker does for the registry (E30), one piece at a time next to the agents' runs: the watches that are
 * due, then the morning sweep, then the ads to read in Meta's Ad Library (lot 3), then the companies still to look up
 * in the annuaire. No model is called and nothing costs: these are free public sources, read at their documented pace.
 * Worker-safe.
 */
export type SignalWork = { kind: "watch"; id: string } | { kind: "sweep"; workspaceId: string } | { kind: "ads"; ids: string[] } | { kind: "identity"; ids: string[] }

export interface SignalDeps {
  bodacc?: BodaccDeps
  annuaire?: AnnuaireDeps
  /** E30 lot 3: the Ad Library's token and client; by default META_ADS_TOKEN and fetch. */
  meta?: AdsDeps
  gapMs?: number
  signal?: AbortSignal
}

export async function claimSignalWork(workerId: string, now = new Date(), deps: SignalDeps = {}): Promise<SignalWork | null> {
  const watch = await claimWatch(workerId, now)
  if (watch) return { kind: "watch", id: watch }
  await ensureSweeps(now)
  const sweep = await claimSweep(workerId, now)
  if (sweep) return { kind: "sweep", workspaceId: sweep }
  if (await adsReady(deps.meta, now)) {
    const ads = await claimAdsBatch(ADS_BATCH, now)
    if (ads.length) return { kind: "ads", ids: ads }
  }
  const ids = await claimIdentityBatch(IDENTITY_BATCH, now)
  return ids.length ? { kind: "identity", ids } : null
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
    case "ads": {
      const r = await runAdsBatch(work.ids, { ...deps.meta, gapMs: deps.meta?.gapMs ?? deps.gapMs, signal: deps.signal })
      return { companies: work.ids.length, read: r.read, running: r.running, signals: r.signals, error: r.error }
    }
    case "identity":
      return runIdentityBatch(work.ids, { ...deps.annuaire, gapMs: deps.gapMs, signal: deps.signal })
  }
}
