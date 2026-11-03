import { AsyncLocalStorage } from "node:async_hooks"
import type { Prisma } from "@prisma/client"

/**
 * What an action is done through (E28): set while an agent's tool runs for a person, read by the audit log and by the
 * fiches' history, which then say "via le Copilote". The person stays the author; this only says how it was done.
 * Server only.
 */
export interface Acting {
  agentId: string
  runId: string
  tool?: string
  missionId?: string
}

const store = new AsyncLocalStorage<Acting>()

export const acting = (): Acting | null => store.getStore() ?? null

export function withActing<T>(context: Acting, fn: () => Promise<T>): Promise<T> {
  return store.run(context, fn)
}

/** An activity's data with what it came through, when an agent did it; unchanged otherwise. */
export function withVia(data: Prisma.InputJsonValue | undefined): Prisma.InputJsonValue | undefined {
  const a = acting()
  if (!a) return data
  const via = { agentId: a.agentId, runId: a.runId, ...(a.missionId ? { missionId: a.missionId } : {}) }
  if (data === undefined || data === null) return { via }
  if (typeof data === "object" && !Array.isArray(data)) return { ...(data as Record<string, Prisma.InputJsonValue>), via }
  return data
}
