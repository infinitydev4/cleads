import type { Prisma } from "@prisma/client"
import type { CurrentUser } from "@/lib/auth/guard"
import { LeadError } from "@/features/leads/errors"
import { DEAL_OWNER_ROLES, OPEN_STAGES } from "./rules"

type Tx = Prisma.TransactionClient

/**
 * Serialises everything that decides whether a fiche has an open opportunity. Two people qualifying the same fiche at
 * the same moment get one opportunity, not two.
 */
export async function lockLead(tx: Tx, leadId: string) {
  await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${leadId} FOR UPDATE`
}

export async function logDeal(tx: Tx, user: CurrentUser, input: { leadId: string; dealId?: string; body: string; data?: Prisma.InputJsonValue }) {
  await tx.activity.create({ data: { workspaceId: user.workspaceId, leadId: input.leadId, dealId: input.dealId, actorId: user.id, actorKind: "USER", kind: "SYSTEM", body: input.body, data: input.data } })
}

/** A deal owner must be an active member who can carry opportunities. */
export async function assertDealOwner(tx: Tx, workspaceId: string, ownerId: string | null) {
  if (!ownerId) return
  const owner = await tx.user.findFirst({ where: { id: ownerId, workspaceId, active: true, role: { in: [...DEAL_OWNER_ROLES] } }, select: { id: true } })
  if (!owner) throw new LeadError("invalid", "Cette personne ne peut pas recevoir d’opportunités (closer, manager ou propriétaire).")
}

/** The fiche's open opportunity, created at the first stage when there is none. Call inside a transaction. */
export async function ensureOpenDeal(tx: Tx, user: CurrentUser, leadId: string, ownerId: string | null) {
  await lockLead(tx, leadId)
  const open = await tx.deal.findFirst({ where: { leadId, stage: { in: [...OPEN_STAGES] } }, orderBy: { createdAt: "desc" } })
  if (open) return { deal: open, created: false }
  await assertDealOwner(tx, user.workspaceId, ownerId)
  const deal = await tx.deal.create({ data: { workspaceId: user.workspaceId, leadId, ownerId, stage: "QUALIFIED" } })
  await logDeal(tx, user, { leadId, dealId: deal.id, body: "Opportunité créée", data: { stage: "QUALIFIED" } })
  return { deal, created: true }
}

/** When a prospect is disqualified, what was open for them is lost, with that as the reason. */
export async function closeOpenDeals(tx: Tx, user: CurrentUser, leadId: string, reason: string) {
  const open = await tx.deal.findMany({ where: { leadId, stage: { in: [...OPEN_STAGES] } }, select: { id: true, stage: true } })
  for (const d of open) {
    await tx.deal.update({ where: { id: d.id }, data: { stage: "LOST", lostReason: reason, lostAt: new Date() } })
    await logDeal(tx, user, { leadId, dealId: d.id, body: `Opportunité perdue : ${reason}`, data: { from: d.stage, to: "LOST" } })
  }
  return open.length
}
