import type { DealStage, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { canAccessRecord, recordFilter, scopeOf } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { scopeWhere } from "@/features/leads/service"
import { assertDealOwner, closeOpenDeals, ensureOpenDeal, lockLead, logDeal } from "./deals"
import { DISQUALIFY_REASONS, LOST_REASONS, OPEN_STAGES, STAGES, checkDealAssign, checkDealMove, isOpen, qualificationSchema, type Qualification } from "./rules"
import { z } from "zod"

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null
const RECENT_CLOSED_DAYS = 30

// ---------------------------------------------------------------------------------------------------------------
// Qualification
// ---------------------------------------------------------------------------------------------------------------

export const qualifySchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("save"), qualification: qualificationSchema }),
  z.object({ decision: z.literal("qualify"), qualification: qualificationSchema, closerId: z.string().min(1).nullable().optional() }),
  z.object({ decision: z.literal("disqualify"), qualification: qualificationSchema.optional(), reason: z.enum(DISQUALIFY_REASONS), detail: z.string().trim().max(500).optional() }),
])
export type QualifyInput = z.infer<typeof qualifySchema>

/**
 * The guided qualification of a fiche: keep the answers, qualify (status Qualified and an opportunity handed to a
 * closer), or disqualify with a reason. One transaction on a locked fiche, so concurrent calls cannot double up.
 */
export async function qualifyLead(user: CurrentUser, leadId: string, input: QualifyInput, ip?: string | null): Promise<{ dealId: string | null }> {
  const visible = await prisma.lead.findFirst({ where: { id: leadId, workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") }, select: { id: true } })
  if (!visible) throw new LeadError("not_found", "Fiche introuvable.", 404)

  const dealId = await prisma.$transaction(async (tx) => {
    await lockLead(tx, leadId)
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId }, include: { contact: true } })
    if (!canAccessRecord(user, "lead:write", lead.ownerId)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée.", 403)

    const previous = (lead.qualification as Qualification | null) ?? {}
    const answers = input.decision === "disqualify" ? (input.qualification ?? {}) : input.qualification
    const merged: Qualification = { ...previous, ...answers, updatedAt: new Date().toISOString(), updatedById: user.id }

    if (input.decision === "save") {
      await tx.lead.update({ where: { id: leadId }, data: { qualification: merged as Prisma.InputJsonValue } })
      await logDeal(tx, user, { leadId, body: "Qualification mise à jour" })
      return null
    }

    if (input.decision === "disqualify") {
      merged.disqualification = { reason: input.reason, ...(input.detail ? { detail: input.detail } : {}) }
      if (lead.status === "DO_NOT_CONTACT") throw new LeadError("conflict", "Cette fiche est marquée « ne pas contacter ».", 409)
      await tx.lead.update({ where: { id: leadId }, data: { status: "DISQUALIFIED", qualification: merged as Prisma.InputJsonValue } })
      await logDeal(tx, user, { leadId, body: `Disqualifiée : ${input.reason}${input.detail ? ` (${input.detail})` : ""}`, data: { from: lead.status, to: "DISQUALIFIED" } })
      await closeOpenDeals(tx, user, leadId, `Prospect disqualifié : ${input.reason}`)
      return null
    }

    // qualify
    if (!canAccessRecord(user, "deal:qualify", lead.ownerId)) throw new LeadError("forbidden", "Votre rôle ne qualifie pas de prospects : un SDR ou un manager s’en charge.", 403)
    if (lead.status === "DO_NOT_CONTACT") throw new LeadError("conflict", "Cette fiche est marquée « ne pas contacter » : elle ne peut pas être qualifiée.", 409)
    delete merged.disqualification
    await tx.lead.update({ where: { id: leadId }, data: { status: "QUALIFIED", qualification: merged as Prisma.InputJsonValue } })
    if (lead.status !== "QUALIFIED") await logDeal(tx, user, { leadId, body: "Qualifiée", data: { from: lead.status, to: "QUALIFIED" } })
    const { deal, created } = await ensureOpenDeal(tx, user, leadId, input.closerId ?? null)
    // An opportunity already open can still be handed to a closer at this point.
    // Once a closer has moved it forward, only a manager changes who holds it.
    if (!created && input.closerId !== undefined && input.closerId !== deal.ownerId) {
      const violation = checkDealAssign(user, deal, input.closerId)
      if (violation && deal.stage !== "QUALIFIED") throw new LeadError("forbidden", violation.message, 403)
      await assertDealOwner(tx, user.workspaceId, input.closerId)
      await tx.deal.update({ where: { id: deal.id }, data: { ownerId: input.closerId } })
      await logDeal(tx, user, { leadId, dealId: deal.id, body: "Opportunité attribuée", data: { to: input.closerId } })
    }
    return deal.id
  })
  await audit({ action: `lead.${input.decision === "save" ? "qualification_saved" : input.decision === "qualify" ? "qualified" : "disqualified"}`, actorId: user.id, workspaceId: user.workspaceId, entityType: "Lead", entityId: leadId, ip })
  return { dealId }
}

// ---------------------------------------------------------------------------------------------------------------
// Board and deals
// ---------------------------------------------------------------------------------------------------------------

export interface BoardDeal {
  id: string
  leadId: string
  name: string
  city: string | null
  stage: DealStage
  amountCents: number | null
  expectedCloseAt: string | null
  ownerId: string | null
  ownerName: string | null
  contactName: string | null
  nextMeetingAt: string | null
  updatedAt: string
  lostReason: string | null
  /** Whether the signed-in person may move this card (the server checks again on every move). */
  canMove: boolean
}

export interface BoardFilters {
  /** "me", "none" or a user id. */
  owner?: string
  q?: string
}

function dealScope(user: CurrentUser): Prisma.DealWhereInput {
  const f = recordFilter(user, "deal:read")
  switch (f.kind) {
    case "all":
      return {}
    case "ownerOrPool":
      return { OR: [{ ownerId: null }, { ownerId: f.ownerId }] }
    case "owner":
      return { ownerId: f.ownerId }
    default:
      return { id: "__no_access__" }
  }
}

const dealInclude = {
  owner: { select: { name: true, email: true } },
  lead: {
    select: {
      company: { select: { name: true, city: true } },
      contact: { select: { name: true, email: true } },
      meetings: { where: { startsAt: { gt: new Date() }, status: { in: ["SCHEDULED", "CONFIRMED"] as ("SCHEDULED" | "CONFIRMED")[] } }, orderBy: { startsAt: "asc" as const }, take: 1, select: { startsAt: true } },
    },
  },
} satisfies Prisma.DealInclude

type DealRow = Prisma.DealGetPayload<{ include: typeof dealInclude }>

function toBoardDeal(user: CurrentUser, d: DealRow): BoardDeal {
  const moveScope = scopeOf(user.role, "deal:move")
  return {
    id: d.id,
    leadId: d.leadId,
    name: d.lead.company?.name ?? d.lead.contact?.name ?? d.lead.contact?.email ?? "Sans nom",
    city: d.lead.company?.city ?? null,
    stage: d.stage,
    amountCents: d.amountCents,
    expectedCloseAt: iso(d.expectedCloseAt),
    ownerId: d.ownerId,
    ownerName: d.owner?.name ?? d.owner?.email ?? null,
    contactName: d.lead.contact?.name ?? null,
    nextMeetingAt: iso(d.lead.meetings[0]?.startsAt),
    updatedAt: d.updatedAt.toISOString(),
    lostReason: d.lostReason,
    canMove: moveScope === "all" || (moveScope === "own" && d.ownerId === user.id),
  }
}

/** The pipeline: every open opportunity, plus what was won or lost in the last 30 days. */
export async function listBoard(user: CurrentUser, filters: BoardFilters = {}): Promise<BoardDeal[]> {
  const since = new Date(Date.now() - RECENT_CLOSED_DAYS * 86_400_000)
  const and: Prisma.DealWhereInput[] = [
    { workspaceId: user.workspaceId },
    dealScope(user),
    { OR: [{ stage: { in: [...OPEN_STAGES] } }, { stage: "WON", wonAt: { gte: since } }, { stage: "LOST", lostAt: { gte: since } }] },
  ]
  if (filters.owner === "me") and.push({ ownerId: user.id })
  else if (filters.owner === "none") and.push({ ownerId: null })
  else if (filters.owner) and.push({ ownerId: filters.owner })
  if (filters.q) and.push({ lead: { OR: [{ company: { name: { contains: filters.q, mode: "insensitive" } } }, { contact: { name: { contains: filters.q, mode: "insensitive" } } }] } })
  const deals = await prisma.deal.findMany({ where: { AND: and }, include: dealInclude, orderBy: [{ updatedAt: "desc" }], take: 600 })
  return deals.map((d) => toBoardDeal(user, d))
}

export const updateDealSchema = z
  .object({
    stage: z.enum(STAGES).optional(),
    lostReason: z.enum(LOST_REASONS).optional(),
    lostDetail: z.string().trim().max(500).optional(),
    amountCents: z.number().int().min(0).max(100_000_000_00).nullable().optional(),
    expectedCloseAt: z.string().datetime().nullable().optional(),
    ownerId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Aucun changement demandé" })
export type UpdateDealInput = z.infer<typeof updateDealSchema>

export async function updateDeal(user: CurrentUser, id: string, patch: UpdateDealInput, ip?: string | null): Promise<BoardDeal> {
  const found = await prisma.deal.findFirst({ where: { id, workspaceId: user.workspaceId, ...dealScope(user) }, select: { id: true, leadId: true } })
  if (!found) throw new LeadError("not_found", "Opportunité introuvable.", 404)

  await prisma.$transaction(async (tx) => {
    await lockLead(tx, found.leadId)
    const deal = await tx.deal.findUniqueOrThrow({ where: { id } })
    const data: Prisma.DealUncheckedUpdateInput = {}
    const lostReason = patch.lostReason ? (patch.lostReason === "Autre" && patch.lostDetail ? `Autre : ${patch.lostDetail}` : patch.lostReason) : undefined

    // Editing the numbers or the owner is as restricted as moving the card.
    const editsDeal = patch.stage !== undefined || patch.amountCents !== undefined || patch.expectedCloseAt !== undefined || patch.ownerId !== undefined
    if (editsDeal) {
      const violation = checkDealMove({ actor: user, deal, to: patch.stage ?? deal.stage, lostReason: lostReason ?? deal.lostReason })
      if (violation) throw new LeadError(violation.code === "invalid" ? "invalid" : "forbidden", violation.message, violation.code === "invalid" ? 400 : 403)
    }

    if (patch.ownerId !== undefined && patch.ownerId !== deal.ownerId) {
      const v = checkDealAssign(user, deal, patch.ownerId)
      if (v) throw new LeadError("forbidden", v.message, 403)
      await assertDealOwner(tx, user.workspaceId, patch.ownerId)
      data.ownerId = patch.ownerId
      await logDeal(tx, user, { leadId: deal.leadId, dealId: id, body: patch.ownerId ? "Opportunité attribuée" : "Opportunité remise à attribuer", data: { from: deal.ownerId, to: patch.ownerId } })
    }
    if (patch.amountCents !== undefined) data.amountCents = patch.amountCents
    if (patch.expectedCloseAt !== undefined) data.expectedCloseAt = patch.expectedCloseAt ? new Date(patch.expectedCloseAt) : null

    if (patch.stage && patch.stage !== deal.stage) {
      data.stage = patch.stage
      if (patch.stage === "WON") Object.assign(data, { wonAt: new Date(), lostAt: null, lostReason: null })
      else if (patch.stage === "LOST") Object.assign(data, { lostAt: new Date(), wonAt: null, lostReason })
      else Object.assign(data, { wonAt: null, lostAt: null, lostReason: null })
      // One open opportunity per fiche: reopening is refused while another one is open.
      if (!isOpen(deal.stage) && isOpen(patch.stage) && (await tx.deal.count({ where: { leadId: deal.leadId, id: { not: id }, stage: { in: [...OPEN_STAGES] } } })) > 0) {
        throw new LeadError("conflict", "Cette fiche a déjà une autre opportunité ouverte.", 409)
      }
      await logDeal(tx, user, { leadId: deal.leadId, dealId: id, body: `Opportunité : ${deal.stage} → ${patch.stage}${patch.stage === "LOST" && lostReason ? ` (${lostReason})` : ""}`, data: { from: deal.stage, to: patch.stage } })
    } else if (patch.lostReason && deal.stage === "LOST") {
      data.lostReason = lostReason
    }
    if (Object.keys(data).length) await tx.deal.update({ where: { id }, data })
  })
  await audit({ action: "deal.updated", actorId: user.id, workspaceId: user.workspaceId, entityType: "Deal", entityId: id, metadata: { fields: Object.keys(patch) }, ip })
  const updated = await prisma.deal.findUniqueOrThrow({ where: { id }, include: dealInclude })
  return toBoardDeal(user, updated)
}
