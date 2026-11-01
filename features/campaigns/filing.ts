import type { Prisma } from "@prisma/client"
import type { CurrentUser } from "@/lib/auth/guard"
import { LeadError } from "@/features/leads/errors"

type Db = Pick<Prisma.TransactionClient, "campaign">
type Tx = Prisma.TransactionClient

/** The campaign a fiche may be filed in: same workspace, not archived. */
export async function assertCampaign(db: Db, workspaceId: string, id: string) {
  const campaign = await db.campaign.findFirst({ where: { id, workspaceId }, select: { id: true, name: true, archivedAt: true } })
  if (!campaign) throw new LeadError("not_found", "Campagne introuvable.", 404)
  if (campaign.archivedAt) throw new LeadError("conflict", `La campagne « ${campaign.name} » est archivée : restaurez-la pour y ranger des fiches.`, 409)
  return campaign
}

/**
 * Files a fiche in a campaign (or takes it out with null), with its line in the history. The caller has checked the
 * right to write on the fiche and campaign:manage.
 */
export async function setLeadCampaign(tx: Tx, user: CurrentUser, lead: { id: string; campaignId: string | null }, campaign: { id: string; name: string } | null, how?: string) {
  if ((campaign?.id ?? null) === lead.campaignId) return false
  const before = lead.campaignId ? await tx.campaign.findUnique({ where: { id: lead.campaignId }, select: { name: true } }) : null
  await tx.lead.update({ where: { id: lead.id }, data: { campaignId: campaign?.id ?? null } })
  const body = campaign
    ? `Rangée dans la campagne « ${campaign.name} »${before ? ` (venait de « ${before.name} »)` : ""}`
    : `Retirée de la campagne « ${before?.name ?? "?"} »`
  await tx.activity.create({
    data: { workspaceId: user.workspaceId, leadId: lead.id, actorId: user.id, actorKind: "USER", kind: "SYSTEM", body: how ? `${body} (${how})` : body, data: { event: "campaign", from: lead.campaignId, to: campaign?.id ?? null } },
  })
  return true
}
