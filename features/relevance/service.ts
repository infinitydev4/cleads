import type { AgentRunStatus, RelevanceVerdict, TriageOutcome } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can, canAccessRecord } from "@/lib/rbac"
import { ACTIVE_RUN_STATUSES } from "@/lib/ai/budget"
import { aiConfigured } from "@/lib/ai/gateway"
import { LeadError } from "@/features/leads/errors"
import { startRun } from "@/features/ai/runs"
import { visibleLeads } from "@/features/metrics/service"
import { RELEVANCE_BATCH } from "./handler"
import { effectiveVerdict } from "./rules"

/**
 * Jev's sorting of a campaign's fiches, in the CRM (E25): asking for it, reading it on the campaign, and a person's
 * decision on a fiche Jev was not sure about. An import into a campaign asks for it on its own; it costs a few
 * hundredths of a cent per fiche.
 */
export interface RelevanceItem {
  id: string
  lead: { id: string; name: string; city: string | null }
  verdict: RelevanceVerdict | null
  confidence: number | null
  outcome: TriageOutcome
  decision: RelevanceVerdict | null
}

export interface RelevanceView {
  counts: { relevant: number; maybe: number; notRelevant: number; toDecide: number; unsorted: number }
  /** Fiches Jev was not sure about, waiting for a person. */
  toDecide: RelevanceItem[]
  /** The best targets, to start with. */
  best: RelevanceItem[]
  run: { id: string; status: AgentRunStatus } | null
  offer: string | null
  canSort: boolean
  canDecide: boolean
  configured: boolean
}

const nameOf = (l: { company: { name: string } | null; contact: { name: string | null; email: string | null } | null }) => l.company?.name ?? l.contact?.name ?? l.contact?.email ?? "Sans nom"

async function campaignOf(user: CurrentUser, campaignId: string) {
  const c = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId: user.workspaceId }, select: { id: true, name: true, archivedAt: true, offer: { select: { name: true } } } })
  if (!c) throw new LeadError("not_found", "Campagne introuvable.", 404)
  return c
}

const activeRun = (workspaceId: string, campaignId: string) =>
  prisma.agentRun.findFirst({ where: { workspaceId, agentId: "qualifier", campaignId, status: { in: [...ACTIVE_RUN_STATUSES] } }, select: { id: true, status: true }, orderBy: { createdAt: "desc" } })

export async function relevanceView(user: CurrentUser, campaignId: string): Promise<RelevanceView> {
  if (!can(user.role, "campaign:read") || !can(user.role, "ai:read")) throw new LeadError("forbidden", "Accès refusé", 403)
  const campaign = await campaignOf(user, campaignId)
  const visible = visibleLeads(user, { campaignId })
  const rows = await prisma.leadRelevance.findMany({
    where: { campaignId, lead: { is: visible } },
    select: {
      id: true,
      verdict: true,
      confidence: true,
      outcome: true,
      decision: true,
      lead: { select: { id: true, company: { select: { name: true, city: true } }, contact: { select: { name: true, email: true } } } },
    },
    orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
    take: 2_000,
  })
  const item = (r: (typeof rows)[number]): RelevanceItem => ({ id: r.id, lead: { id: r.lead.id, name: nameOf(r.lead), city: r.lead.company?.city ?? null }, verdict: r.verdict, confidence: r.confidence, outcome: r.outcome, decision: r.decision })
  const verdictOf = (r: (typeof rows)[number]) => effectiveVerdict(r)
  const [unsorted, run] = await Promise.all([prisma.lead.count({ where: { AND: [visible, { relevances: { none: { campaignId } } }] } }), activeRun(user.workspaceId, campaignId)])
  const pending = rows.filter((r) => !verdictOf(r))
  return {
    counts: {
      relevant: rows.filter((r) => verdictOf(r) === "RELEVANT").length,
      maybe: rows.filter((r) => verdictOf(r) === "MAYBE").length,
      notRelevant: rows.filter((r) => verdictOf(r) === "NOT_RELEVANT").length,
      toDecide: pending.length,
      unsorted,
    },
    toDecide: pending.slice(0, 20).map(item),
    best: rows.filter((r) => verdictOf(r) === "RELEVANT").slice(0, 8).map(item),
    run,
    offer: campaign.offer?.name ?? null,
    canSort: can(user.role, "ai:use") && can(user.role, "campaign:manage") && !campaign.archivedAt,
    canDecide: can(user.role, "ai:use"),
    configured: aiConfigured(),
  }
}

/**
 * Asks Jev to sort the campaign's fiches it has not judged yet (a batch; the worker chains the next ones). `auto`: the
 * request comes from an import, which must never fail because of it: nothing to sort or a sort already running is no
 * error then.
 */
export async function requestRelevance(user: CurrentUser, campaignId: string, opts: { auto?: boolean } = {}): Promise<{ runId: string | null; queued: number }> {
  if (!can(user.role, "ai:use") || !can(user.role, "campaign:manage")) {
    if (opts.auto) return { runId: null, queued: 0 }
    throw new LeadError("forbidden", "Votre rôle ne permet pas de lancer le tri des fiches.", 403)
  }
  if (opts.auto && !aiConfigured()) return { runId: null, queued: 0 }
  const campaign = await campaignOf(user, campaignId)
  if (campaign.archivedAt) throw new LeadError("conflict", "Cette campagne est archivée.", 409)
  const running = await activeRun(user.workspaceId, campaignId)
  if (running) {
    if (opts.auto) return { runId: running.id, queued: 0 }
    throw new LeadError("conflict", "Jev trie déjà les fiches de cette campagne.", 409)
  }
  const fiches = await prisma.lead.findMany({
    where: { AND: [visibleLeads(user, { campaignId }), { relevances: { none: { campaignId } } }] },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: RELEVANCE_BATCH,
  })
  if (!fiches.length) {
    if (opts.auto) return { runId: null, queued: 0 }
    throw new LeadError("conflict", "Toutes les fiches de la campagne sont déjà triées.", 409)
  }
  const run = await startRun(user, { agentId: "qualifier", campaignId, status: "QUEUED", input: { leadIds: fiches.map((f) => f.id), chain: 0 } })
  return { runId: run.id, queued: fiches.length }
}

/** After an import into a campaign: the sort starts on its own, and nothing about it can fail the import. */
export async function sortAfterImport(user: CurrentUser, campaignId: string): Promise<void> {
  try {
    await requestRelevance(user, campaignId, { auto: true })
  } catch (error) {
    console.warn("[RELEVANCE] not queued after import", error instanceof Error ? error.message : error)
  }
}

/** A person decides for a fiche (Jev was not sure, or got it wrong). */
export async function decideRelevance(user: CurrentUser, relevanceId: string, decision: RelevanceVerdict, ip?: string | null): Promise<void> {
  if (!can(user.role, "ai:use")) throw new LeadError("forbidden", "Votre rôle ne permet pas de trier les fiches.", 403)
  const r = await prisma.leadRelevance.findFirst({ where: { id: relevanceId, workspaceId: user.workspaceId }, select: { id: true, campaignId: true, lead: { select: { id: true, ownerId: true } } } })
  if (!r) throw new LeadError("not_found", "Fiche introuvable.", 404)
  const seen = await prisma.lead.count({ where: { AND: [visibleLeads(user), { id: r.lead.id }] } })
  if (!seen) throw new LeadError("not_found", "Fiche introuvable.", 404)
  if (!can(user.role, "campaign:manage") && !canAccessRecord(user, "lead:write", r.lead.ownerId)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée.", 403)
  await prisma.leadRelevance.update({ where: { id: r.id }, data: { decision, decidedById: user.id, decidedAt: new Date() } })
  await audit({ action: "relevance.decided", actorId: user.id, workspaceId: user.workspaceId, entityType: "Lead", entityId: r.lead.id, metadata: { campaignId: r.campaignId, decision }, ip })
}
