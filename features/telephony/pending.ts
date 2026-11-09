import type { Prisma } from "@prisma/client"

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
