import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { PhoneCallSummary } from "@/features/leads/types"

type Tx = Prisma.TransactionClient

/** What a CALL activity written by the PBX holds. `pending` until the person adds what only they know (E32). */
export interface PhoneCallData {
  phoneCallId: string
  direction: "OUTBOUND" | "INBOUND"
  durationSec: number
  disposition: string
  outcome?: string
  pending?: boolean
}

/** How long after the PBX reported a call the person's own log of it completes it. */
const SAME_CALL_MS = 30 * 60_000

/**
 * The PBX's call this person is logging, if it reported one in the last half hour that still waits for their word.
 * Called by addActivity so that one real call stays one CALL activity.
 */
export async function pendingPhoneCall(tx: Tx, actorId: string, leadId: string, now = new Date()) {
  const recent = await tx.activity.findMany({
    where: { leadId, actorId, kind: "CALL", createdAt: { gte: new Date(now.getTime() - SAME_CALL_MS) } },
    orderBy: { createdAt: "desc" },
    take: 5,
  })
  return recent.find((a) => (a.data as Partial<PhoneCallData> | null)?.pending === true) ?? null
}

/** Marks the calls of a timeline that have a recording to listen to (lot 2), in one query. */
export async function withRecordings<T extends { call: PhoneCallSummary | null }>(items: T[]): Promise<T[]> {
  const ids = items.flatMap((a) => (a.call ? [a.call.id] : []))
  if (ids.length === 0) return items
  const recorded = new Set((await prisma.phoneCall.findMany({ where: { id: { in: ids }, recordingId: { not: null } }, select: { id: true } })).map((c) => c.id))
  return items.map((a) => (a.call && recorded.has(a.call.id) ? { ...a, call: { ...a.call, recorded: true } } : a))
}
