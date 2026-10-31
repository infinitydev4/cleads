import type { EnrollmentStopReason, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { STOP_LABELS } from "./sequence-rules"

type Db = Prisma.TransactionClient | typeof prisma

/**
 * Stops running enrollments and says why on each fiche. Kept free of other feature imports: the places that learn of
 * a reply, a bounce, an unsubscribe or a status change all call it, so it must not depend on any of them.
 * Idempotent: only running enrollments are touched.
 */
export async function stopEnrollments(db: Db, where: Prisma.SequenceEnrollmentWhereInput, reason: EnrollmentStopReason, actorId?: string | null): Promise<number> {
  const rows = await db.sequenceEnrollment.findMany({ where: { ...where, status: "ACTIVE" }, select: { id: true, leadId: true, workspaceId: true, sequence: { select: { name: true } } } })
  if (!rows.length) return 0
  const { count } = await db.sequenceEnrollment.updateMany({ where: { id: { in: rows.map((r) => r.id) }, status: "ACTIVE" }, data: { status: "STOPPED", stoppedReason: reason, stoppedAt: new Date(), nextAt: null } })
  await db.activity.createMany({
    data: rows.map((r) => ({
      workspaceId: r.workspaceId,
      leadId: r.leadId,
      actorId: actorId ?? null,
      actorKind: actorId ? ("USER" as const) : ("SYSTEM" as const),
      kind: "EMAIL" as const,
      body: `Séquence « ${r.sequence.name} » arrêtée : ${STOP_LABELS[reason]}`,
      data: { event: "sequence_stopped", enrollmentId: r.id, reason },
    })),
  })
  return count
}

export const stopForLead = (db: Db, leadId: string, reason: EnrollmentStopReason, actorId?: string | null) => stopEnrollments(db, { leadId }, reason, actorId)

/** Every running enrollment whose fiche writes to this address (the contact's, or the company's when it has none). */
export const stopForEmail = (db: Db, workspaceId: string, email: string, reason: EnrollmentStopReason) =>
  stopEnrollments(db, { workspaceId, lead: { OR: [{ contact: { email } }, { company: { email } }] } }, reason)
