import type { AgentRunStatus, Prisma, StrategyTargetStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { ACTIVE_RUN_STATUSES, microsToEur } from "@/lib/ai/budget"
import { aiConfigured } from "@/lib/ai/gateway"
import { LeadError } from "@/features/leads/errors"
import { finishRun, isManager, startRun } from "@/features/ai/runs"
import { workerStatus } from "@/features/ai/queue"
import { createCampaign } from "@/features/campaigns/service"
import { startSearch } from "@/features/search/service"
import type { ExtractorClient } from "@/lib/extractor/client"
import { searchStatus } from "@/lib/crm/status"
import { BASES, type Basis, type StrategyBrief, type TargetAction } from "./schemas"

/**
 * The Stratège in the CRM (E25): asking it for targets, reading its proposals, and what a person does with each
 * target. It never launches anything by itself: creating the campaign and launching its search are the person's
 * clicks, through the CRM's own services (D27), so every Extractor job is recorded with its campaign and journal.
 */

export interface TargetView {
  id: string
  rank: number
  sector: string
  sectorKey: string | null
  zones: string[]
  pains: string[]
  offer: { id: string | null; name: string }
  angle: string
  rationale: { text: string; basis: Basis }[]
  campaignName: string
  search: { activity: string; location: string; maxResults: number }
  knownCount: number | null
  status: StrategyTargetStatus
  campaign: { id: string; name: string } | null
  launched: { id: string; label: string; status: string } | null
  decidedBy: string | null
  decidedAt: string | null
}

export interface ProposalView {
  id: string
  createdAt: string
  requestedBy: string | null
  brief: StrategyBrief
  summary: string | null
  sectorsFrom: string | null
  run: { id: string; status: AgentRunStatus; error: string | null; costEur: number } | null
  targets: TargetView[]
}

export interface StrategyState {
  proposals: ProposalView[]
  /** Why asking is not possible now, in words; null when it is. */
  blocked: string | null
  canAsk: boolean
  canLaunch: boolean
  activeOffers: { slug: string; name: string }[]
}

const who = (u: { name: string | null; email: string | null } | null) => u?.name ?? u?.email ?? null

const include = {
  requestedBy: { select: { name: true, email: true } },
  run: { select: { id: true, status: true, error: true, costMicros: true } },
  targets: {
    orderBy: { rank: "asc" },
    include: { campaign: { select: { id: true, name: true } }, search: { select: { id: true, label: true, status: true } } },
  },
} satisfies Prisma.StrategyProposalInclude

type Row = Prisma.StrategyProposalGetPayload<{ include: typeof include }>

const basisOf = (v: unknown): Basis => (typeof v === "string" && (BASES as readonly string[]).includes(v) ? (v as Basis) : "hypothesis")

function toView(p: Row, people: Map<string, string>): ProposalView {
  const brief = (p.brief && typeof p.brief === "object" ? p.brief : {}) as StrategyBrief
  return {
    id: p.id,
    createdAt: p.createdAt.toISOString(),
    requestedBy: who(p.requestedBy),
    brief,
    summary: p.summary,
    sectorsFrom: p.sectorsFrom,
    run: p.run && { id: p.run.id, status: p.run.status, error: p.run.error, costEur: microsToEur(p.run.costMicros) },
    targets: p.targets.map((t) => ({
      id: t.id,
      rank: t.rank,
      sector: t.sector,
      sectorKey: t.sectorKey,
      zones: t.zones,
      pains: t.pains,
      offer: { id: t.offerId, name: t.offerName },
      angle: t.angle,
      rationale: (Array.isArray(t.rationale) ? t.rationale : []).flatMap((r) => (r && typeof r === "object" && typeof (r as { text?: unknown }).text === "string" ? [{ text: (r as { text: string }).text, basis: basisOf((r as { basis?: unknown }).basis) }] : [])),
      campaignName: t.campaignName,
      search: { activity: t.activity, location: t.location, maxResults: t.maxResults },
      knownCount: t.knownCount,
      status: t.status,
      campaign: t.campaign,
      launched: t.search && { id: t.search.id, label: t.search.label, status: searchStatus[t.search.status as keyof typeof searchStatus]?.label ?? t.search.status },
      decidedBy: t.decidedById ? (people.get(t.decidedById) ?? null) : null,
      decidedAt: t.decidedAt?.toISOString() ?? null,
    })),
  }
}

const canAskFor = (u: CurrentUser) => can(u.role, "ai:use") && can(u.role, "campaign:manage")

/** The person's proposals (all of them for owners and managers), latest first, and whether they may ask again. */
export async function strategyState(user: CurrentUser, opts: { limit?: number } = {}): Promise<StrategyState> {
  if (!can(user.role, "campaign:read") || !can(user.role, "ai:read")) throw new LeadError("forbidden", "Accès refusé", 403)
  const [rows, offers, worker] = await Promise.all([
    prisma.strategyProposal.findMany({
      where: { workspaceId: user.workspaceId, ...(isManager(user) ? {} : { requestedById: user.id }) },
      include,
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.limit ?? 5, 20),
    }),
    prisma.offer.findMany({ where: { workspaceId: user.workspaceId, status: "ACTIVE" }, select: { slug: true, name: true }, orderBy: { name: "asc" } }),
    workerStatus(user.workspaceId),
  ])
  const deciders = [...new Set(rows.flatMap((r) => r.targets.map((t) => t.decidedById)).filter((x): x is string => !!x))]
  const people = new Map((await prisma.user.findMany({ where: { id: { in: deciders } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name ?? u.email ?? ""]))
  const canAsk = canAskFor(user)
  const blocked = !canAsk
    ? null
    : !aiConfigured()
      ? "L’IA n’est pas configurée sur ce serveur."
      : !offers.length
        ? "Aucune offre n’est active : le Stratège ne propose que des offres du catalogue (Agents IA › Offres)."
        : !worker.online
          ? "Le worker IA ne répond pas : la demande attendra son retour."
          : null
  return { proposals: rows.map((r) => toView(r, people)), blocked, canAsk, canLaunch: can(user.role, "search:run") && can(user.role, "campaign:manage"), activeOffers: offers }
}

/** Asks the Stratège for targets: the run is queued for the worker, and its proposal waits for its answer. */
export async function requestStrategy(user: CurrentUser, brief: StrategyBrief): Promise<{ proposalId: string; runId: string }> {
  if (!canAskFor(user)) throw new LeadError("forbidden", "Votre rôle ne permet pas de solliciter le Stratège.", 403)
  if (brief.offerSlug && !(await prisma.offer.count({ where: { workspaceId: user.workspaceId, slug: brief.offerSlug, status: "ACTIVE" } }))) {
    throw new LeadError("invalid", "Cette offre n’est pas active dans le catalogue.")
  }
  const busy = await prisma.agentRun.count({ where: { workspaceId: user.workspaceId, agentId: "strategist", requestedById: user.id, status: { in: [...ACTIVE_RUN_STATUSES] } } })
  if (busy) throw new LeadError("conflict", "Le Stratège travaille déjà pour vous : attendez sa proposition.", 409)
  const run = await startRun(user, { agentId: "strategist", status: "QUEUED", input: { brief } })
  try {
    const proposal = await prisma.strategyProposal.create({ data: { workspaceId: user.workspaceId, runId: run.id, requestedById: user.id, brief: brief as Prisma.InputJsonValue }, select: { id: true } })
    return { proposalId: proposal.id, runId: run.id }
  } catch (error) {
    await finishRun(run.id, { status: "FAILED", error: "Proposition non enregistrée" })
    throw error
  }
}

async function loadTarget(user: CurrentUser, id: string) {
  const t = await prisma.strategyTarget.findFirst({
    where: { id, proposal: { workspaceId: user.workspaceId } },
    include: { proposal: { select: { requestedById: true } }, offer: { select: { id: true, status: true } } },
  })
  if (!t) throw new LeadError("not_found", "Cible introuvable.", 404)
  return t
}

const notNow = (status: StrategyTargetStatus) =>
  new LeadError("conflict", status === "DISMISSED" ? "Cette cible a été écartée." : status === "LAUNCHED" ? "La recherche de cette cible est déjà lancée." : "Cette cible a déjà sa campagne.", 409)

/** A campaign for the target, as a draft, under its suggested name (numbered if the name is taken). */
async function campaignFor(user: CurrentUser, t: Awaited<ReturnType<typeof loadTarget>>): Promise<string> {
  const description = [t.angle, t.pains.length ? `Douleurs : ${t.pains.join(" ; ")}.` : null, "Proposée par le Stratège."].filter(Boolean).join("\n").slice(0, 1_000)
  const offerId = t.offer?.status === "ACTIVE" ? t.offer.id : null
  for (let n = 1; n <= 5; n++) {
    const name = n === 1 ? t.campaignName : `${t.campaignName.slice(0, 74)} (${n})`
    try {
      const { id } = await createCampaign(user, { name, description, sector: t.sector.slice(0, 100), area: t.zones.join(", ").slice(0, 120) || null, ownerId: user.id, startsOn: null, endsOn: null, goalLeads: null, goalMeetings: null, offerId, status: "DRAFT" })
      return id
    } catch (error) {
      if (!(error instanceof LeadError && error.code === "duplicate")) throw error
    }
  }
  throw new LeadError("duplicate", "Plusieurs campagnes portent déjà ce nom : créez-la à la main.", 409)
}

/**
 * What a person does with a target: create its campaign (a draft), launch its search for that campaign (creating the
 * campaign first if needed), or set it aside. Each target moves once: two clicks at the same moment cannot create two
 * campaigns or launch two searches.
 */
export async function actOnTarget(user: CurrentUser, targetId: string, action: TargetAction, ip?: string | null, deps: { extractor?: Pick<ExtractorClient, "createJob"> } = {}): Promise<TargetView["status"]> {
  if (!can(user.role, "campaign:manage")) throw new LeadError("forbidden", "Votre rôle ne permet pas de créer de campagne.", 403)
  const t = await loadTarget(user, targetId)
  const now = new Date()

  if (action.action === "dismiss") {
    const res = await prisma.strategyTarget.updateMany({ where: { id: t.id, status: { in: ["PROPOSED", "CAMPAIGN"] } }, data: { status: "DISMISSED", decidedById: user.id, decidedAt: now } })
    if (res.count !== 1) throw notNow(t.status)
    await audit({ action: "strategy.target_dismissed", actorId: user.id, workspaceId: user.workspaceId, entityType: "StrategyTarget", entityId: t.id, ip })
    return "DISMISSED"
  }

  if (action.action === "campaign") {
    const claimed = await prisma.strategyTarget.updateMany({ where: { id: t.id, status: "PROPOSED" }, data: { status: "CAMPAIGN", decidedById: user.id, decidedAt: now } })
    if (claimed.count !== 1) throw notNow(t.status)
    try {
      const campaignId = await campaignFor(user, t)
      await prisma.strategyTarget.update({ where: { id: t.id }, data: { campaignId } })
      await audit({ action: "strategy.target_campaign", actorId: user.id, workspaceId: user.workspaceId, entityType: "StrategyTarget", entityId: t.id, metadata: { campaignId }, ip })
      return "CAMPAIGN"
    } catch (error) {
      await prisma.strategyTarget.update({ where: { id: t.id }, data: { status: "PROPOSED", decidedById: null, decidedAt: null } })
      throw error
    }
  }

  // The search: the person confirmed (and may have adjusted) what the Stratège proposed.
  if (!can(user.role, "search:run")) throw new LeadError("forbidden", "Votre rôle ne permet pas de lancer une recherche.", 403)
  const before = t.status
  const claimed = await prisma.strategyTarget.updateMany({ where: { id: t.id, status: { in: ["PROPOSED", "CAMPAIGN"] } }, data: { status: "LAUNCHED", decidedById: user.id, decidedAt: now } })
  if (claimed.count !== 1) throw notNow(t.status)
  let campaignId = t.campaignId
  try {
    if (!campaignId) {
      campaignId = await campaignFor(user, t)
      await prisma.strategyTarget.update({ where: { id: t.id }, data: { campaignId } })
    }
    const search = await startSearch(user, { ...action.search, enrich: true, campaignId }, ip, deps.extractor)
    await prisma.strategyTarget.update({ where: { id: t.id }, data: { searchId: search.id } })
    await audit({ action: "strategy.target_search", actorId: user.id, workspaceId: user.workspaceId, entityType: "StrategyTarget", entityId: t.id, metadata: { campaignId, searchId: search.id, ...action.search }, ip })
    return "LAUNCHED"
  } catch (error) {
    // The campaign stays if it was created; only the launch is undone.
    await prisma.strategyTarget.update({ where: { id: t.id }, data: campaignId ? { status: "CAMPAIGN", campaignId } : { status: before, decidedById: null, decidedAt: null } })
    throw error
  }
}
