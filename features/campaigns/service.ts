import type { CampaignStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { campaignCohorts, periodCounts, periodsOf, visibleLeads, weeklySeries, type CohortCounts, type PeriodCounts } from "@/features/metrics/service"
import type { CreateCampaignInput, UpdateCampaignInput } from "./schemas"

const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null
const toDate = (key: string | null | undefined) => (key ? new Date(`${key}T00:00:00Z`) : key === null ? null : undefined)
const who = (u: { name: string | null; email: string | null } | null) => u?.name ?? u?.email ?? null

/** Roles that can be responsible for a campaign (a reader cannot run one). */
const OWNER_ROLES = ["OWNER", "MANAGER", "SDR", "CLOSER"] as const

export interface CampaignView {
  id: string
  name: string
  description: string | null
  status: CampaignStatus
  sector: string | null
  area: string | null
  ownerId: string | null
  ownerName: string | null
  startsOn: string | null
  endsOn: string | null
  goalLeads: number | null
  goalMeetings: number | null
  archived: boolean
  createdAt: string
  /** Cohort figures over the fiches the person sees (features/metrics/definitions.ts, CAMPAIGN_INDICATORS). */
  stats: CohortCounts
}

export interface CampaignDetail extends CampaignView {
  /** Activity of the last 30 days on the campaign's fiches. */
  recent: PeriodCounts
  weekly: { weekEnding: string; leads: number; meetings: number }[]
  searches: { id: string; label: string; status: string; importedCount: number; createdAt: string }[]
  sequences: { id: string; name: string; active: number; total: number }[]
  can: { manage: boolean; fileLeads: boolean }
}

const include = { owner: { select: { name: true, email: true } } } satisfies Prisma.CampaignInclude
type Row = Prisma.CampaignGetPayload<{ include: typeof include }>

const EMPTY: CohortCounts = { leads: 0, contacted: 0, replied: 0, qualified: 0, meetings: 0, won: 0, replyRate: null, conversion: null }

function toView(c: Row, stats: CohortCounts = EMPTY): CampaignView {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status,
    sector: c.sector,
    area: c.area,
    ownerId: c.ownerId,
    ownerName: who(c.owner),
    startsOn: day(c.startsOn),
    endsOn: day(c.endsOn),
    goalLeads: c.goalLeads,
    goalMeetings: c.goalMeetings,
    archived: !!c.archivedAt,
    createdAt: c.createdAt.toISOString(),
    stats,
  }
}

const STATUS_ORDER: Record<CampaignStatus, number> = { ACTIVE: 0, PAUSED: 1, DRAFT: 2, COMPLETED: 3 }

/** Campaigns with their figures, active ones first. */
export async function listCampaigns(user: CurrentUser, opts: { archived?: boolean } = {}): Promise<CampaignView[]> {
  const rows = await prisma.campaign.findMany({ where: { workspaceId: user.workspaceId, archivedAt: opts.archived ? { not: null } : null }, include, orderBy: { createdAt: "desc" } })
  const stats = await campaignCohorts(user, rows.map((r) => r.id))
  return rows.map((r) => toView(r, stats.get(r.id))).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.stats.leads - a.stats.leads)
}

/** Campaigns a fiche or a search can be filed in, for selectors. */
export async function campaignOptions(user: CurrentUser) {
  const rows = await prisma.campaign.findMany({ where: { workspaceId: user.workspaceId, archivedAt: null }, select: { id: true, name: true, status: true, sector: true, area: true }, orderBy: { name: "asc" } })
  return rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name, "fr"))
}

async function load(user: CurrentUser, id: string) {
  const c = await prisma.campaign.findFirst({ where: { id, workspaceId: user.workspaceId }, include })
  if (!c) throw new LeadError("not_found", "Campagne introuvable.", 404)
  return c
}

export async function getCampaign(user: CurrentUser, id: string, now = new Date()): Promise<CampaignDetail> {
  const c = await load(user, id)
  const inCampaign = { campaignId: id }
  const [stats, recent, weekly, searches, enrollments] = await Promise.all([
    campaignCohorts(user, [id]),
    periodCounts(user, periodsOf(30, now).current, inCampaign),
    weeklySeries(user, 8, now, inCampaign),
    prisma.extractionSearch.findMany({ where: { workspaceId: user.workspaceId, campaignId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, label: true, status: true, importedCount: true, createdAt: true } }),
    prisma.sequenceEnrollment.groupBy({ by: ["sequenceId", "status"], where: { workspaceId: user.workspaceId, lead: { is: visibleLeads(user, inCampaign) } }, _count: { _all: true } }),
  ])
  const sequenceIds = [...new Set(enrollments.map((e) => e.sequenceId))]
  const names = new Map((await prisma.sequence.findMany({ where: { id: { in: sequenceIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]))
  const sequences = sequenceIds.map((sid) => {
    const rows = enrollments.filter((e) => e.sequenceId === sid)
    return { id: sid, name: names.get(sid) ?? "Séquence", active: rows.filter((r) => r.status === "ACTIVE").reduce((n, r) => n + r._count._all, 0), total: rows.reduce((n, r) => n + r._count._all, 0) }
  })
  const manage = can(user.role, "campaign:manage")
  return {
    ...toView(c, stats.get(id)),
    recent,
    weekly,
    searches: searches.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
    sequences: sequences.sort((a, b) => b.total - a.total),
    can: { manage, fileLeads: manage && can(user.role, "lead:write") && !c.archivedAt },
  }
}

async function assertOwner(workspaceId: string, ownerId: string | null | undefined) {
  if (!ownerId) return
  const ok = await prisma.user.findFirst({ where: { id: ownerId, workspaceId, active: true, role: { in: [...OWNER_ROLES] } }, select: { id: true } })
  if (!ok) throw new LeadError("invalid", "Ce responsable n’est pas un membre actif de l’équipe.")
}

const duplicateName = (error: unknown) => (error as { code?: string })?.code === "P2002"

export async function createCampaign(user: CurrentUser, input: CreateCampaignInput, ip?: string | null): Promise<{ id: string }> {
  if (!can(user.role, "campaign:manage")) throw new LeadError("forbidden", "Vous ne pouvez pas créer de campagne.", 403)
  await assertOwner(user.workspaceId, input.ownerId)
  try {
    const c = await prisma.campaign.create({
      data: {
        workspaceId: user.workspaceId,
        name: input.name,
        description: input.description,
        status: input.status ?? "DRAFT",
        sector: input.sector,
        area: input.area,
        ownerId: input.ownerId ?? user.id,
        startsOn: toDate(input.startsOn) ?? null,
        endsOn: toDate(input.endsOn) ?? null,
        goalLeads: input.goalLeads,
        goalMeetings: input.goalMeetings,
        createdById: user.id,
      },
    })
    await audit({ action: "campaign.created", actorId: user.id, workspaceId: user.workspaceId, entityType: "Campaign", entityId: c.id, metadata: { name: c.name }, ip })
    return { id: c.id }
  } catch (error) {
    if (duplicateName(error)) throw new LeadError("duplicate", "Une campagne porte déjà ce nom.", 409)
    throw error
  }
}

export async function updateCampaign(user: CurrentUser, id: string, patch: UpdateCampaignInput, ip?: string | null): Promise<CampaignView> {
  if (!can(user.role, "campaign:manage")) throw new LeadError("forbidden", "Vous ne pouvez pas modifier les campagnes.", 403)
  const c = await load(user, id)
  if (patch.ownerId !== undefined) await assertOwner(user.workspaceId, patch.ownerId)
  const startsOn = patch.startsOn !== undefined ? toDate(patch.startsOn) : c.startsOn
  const endsOn = patch.endsOn !== undefined ? toDate(patch.endsOn) : c.endsOn
  if (startsOn && endsOn && endsOn < startsOn) throw new LeadError("invalid", "La fin de la campagne doit suivre son début.")
  const data: Prisma.CampaignUpdateInput = {
    name: patch.name,
    description: patch.description,
    sector: patch.sector,
    area: patch.area,
    owner: patch.ownerId === undefined ? undefined : patch.ownerId ? { connect: { id: patch.ownerId } } : { disconnect: true },
    startsOn: patch.startsOn !== undefined ? startsOn : undefined,
    endsOn: patch.endsOn !== undefined ? endsOn : undefined,
    goalLeads: patch.goalLeads,
    goalMeetings: patch.goalMeetings,
    status: patch.status,
    archivedAt: patch.archived === undefined ? undefined : patch.archived ? (c.archivedAt ?? new Date()) : null,
  }
  try {
    const row = await prisma.campaign.update({ where: { id }, data, include })
    const action = patch.archived === true && !c.archivedAt ? "campaign.archived" : patch.archived === false && c.archivedAt ? "campaign.restored" : "campaign.updated"
    await audit({ action, actorId: user.id, workspaceId: user.workspaceId, entityType: "Campaign", entityId: id, metadata: { fields: Object.keys(patch).filter((k) => patch[k as keyof UpdateCampaignInput] !== undefined) }, ip })
    return toView(row, (await campaignCohorts(user, [id])).get(id))
  } catch (error) {
    if (duplicateName(error)) throw new LeadError("duplicate", "Une campagne porte déjà ce nom.", 409)
    throw error
  }
}
