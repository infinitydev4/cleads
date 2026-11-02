import type { AgentRunStatus, OfferCategory, OfferPitch, OfferRecommendation, RecommendationRole, RecommendationStatus, RejectionReason } from "@prisma/client"
import type { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit as journal } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can, canAccessRecord } from "@/lib/rbac"
import { aiConfigured } from "@/lib/ai/gateway"
import { ACTIVE_RUN_STATUSES } from "@/lib/ai/budget"
import { LeadError } from "@/features/leads/errors"
import { startRun } from "@/features/ai/runs"
import { workerStatus } from "@/features/ai/queue"
import { formatOfferPrice } from "@/features/offers/labels"
import { activeOffers } from "@/features/offers/service"
import { signalLabel } from "@/features/offers/signals"
import { latestFor } from "@/features/prospect-audit/latest"
import { visibleLead } from "@/features/prospect-audit/service"
import { auditReportSchema, evidenceSchema, type Evidence } from "@/features/prospect-audit/schemas"
import { packBudget } from "./labels"
import { NO_ACTIVE_OFFER, NO_AUDIT, NO_CANDIDATE, candidatesFor } from "./rules"
import { emailAngleSchema, objectionSchema, scriptSchema, type CallScript, type DecideInput, type EmailAngle, type Objection } from "./schemas"

/**
 * Suggested offers on a fiche (E21, docs/crm-v1/AGENTS-IA.md §14): the latest pitch, the candidates the audit already
 * calls for, starting the advisor, and a person's decision on each offer, kept to measure relevance (E27). Offers and
 * their prices are internal: seeing them needs `ai:use`, like the Agents IA module.
 */
export interface RecommendationView {
  id: string
  rank: number
  role: RecommendationRole
  offer: { id: string | null; slug: string; name: string; category: OfferCategory; price: string; priceNote: string | null; /** Still active in the catalogue. */ active: boolean }
  fit: number
  signals: { key: string; label: string }[]
  why: string
  gain: string
  evidence: string[]
  objection: Objection | null
  status: RecommendationStatus
  reason: RejectionReason | null
  note: string | null
  decidedBy: string | null
  decidedAt: string | null
}

export interface PitchView {
  id: string
  createdAt: string
  createdBy: string | null
  auditId: string | null
  /** Built on another audit than the one the fiche shows now. */
  stale: boolean
  headline: string
  recommendations: RecommendationView[]
  /** The main offer and its complements, with their budget added up from the catalogue's prices. */
  pack: { names: string[]; budget: string | null }
  script: CallScript
  objections: Objection[]
  email: EmailAngle | null
  evidence: Evidence[]
  notes: string[]
  model: string | null
  costEur: number
}

export interface LeadPitchState {
  pitch: PitchView | null
  audit: { id: string; createdAt: string; fresh: boolean } | null
  /** Active offers the current audit calls for, before any model: what the advisor will rank. */
  candidates: { slug: string; name: string; signals: string[] }[]
  activeOffers: number
  run: { id: string; status: AgentRunStatus; createdAt: string; error: string | null } | null
  /** The last pitch that did not finish, when nothing newer replaced it: why, in words for the person. */
  lastFailure: { runId: string; at: string; error: string } | null
  canRun: boolean
  canDecide: boolean
  canManageOffers: boolean
  configured: boolean
  workerOnline: boolean
}

const EMPTY_SCRIPT: CallScript = { opening: "", hook: { text: "", evidence: [] }, questions: [], proposal: "", close: "" }

/** Stored JSON read back through its schema: anything that does not fit is left out rather than shown wrong. */
function parsed<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const r = schema.safeParse(value)
  return r.success ? r.data : null
}
const listOf = <T>(schema: z.ZodType<T>, value: unknown): T[] => (Array.isArray(value) ? value.flatMap((x) => parsed(schema, x) ?? []) : [])

async function peopleNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  if (!unique.length) return new Map()
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } })
  return new Map(users.map((u) => [u.id, u.name ?? u.email ?? "Membre"]))
}

async function activeOfferIds(ids: (string | null)[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  if (!unique.length) return new Set()
  const rows = await prisma.offer.findMany({ where: { id: { in: unique }, status: "ACTIVE" }, select: { id: true } })
  return new Set(rows.map((r) => r.id))
}

function toRecommendationView(r: OfferRecommendation, names: Map<string, string>, active: Set<string>): RecommendationView {
  return {
    id: r.id,
    rank: r.rank,
    role: r.role,
    offer: { id: r.offerId, slug: r.offerSlug, name: r.offerName, category: r.category, price: formatOfferPrice(r), priceNote: r.priceNote, active: !!r.offerId && active.has(r.offerId) },
    fit: r.fit,
    signals: r.signals.map((key) => ({ key, label: signalLabel(key) })),
    why: r.why,
    gain: r.gain,
    evidence: r.evidence,
    objection: r.objection && r.answer ? { objection: r.objection, answer: r.answer } : null,
    status: r.status,
    reason: r.reason,
    note: r.note,
    decidedBy: r.decidedById ? (names.get(r.decidedById) ?? "Ancien membre") : null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
  }
}

async function toPitchView(row: OfferPitch & { recommendations: OfferRecommendation[] }, currentAuditId: string | null): Promise<PitchView> {
  const [names, active] = await Promise.all([peopleNames([row.createdById, ...row.recommendations.map((r) => r.decidedById)]), activeOfferIds(row.recommendations.map((r) => r.offerId))])
  const pack = row.recommendations.filter((r) => r.role === "MAIN" || r.role === "COMPLEMENT")
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdById ? (names.get(row.createdById) ?? "Ancien membre") : null,
    auditId: row.auditId,
    stale: !row.auditId || row.auditId !== currentAuditId,
    headline: row.headline,
    recommendations: row.recommendations.map((r) => toRecommendationView(r, names, active)),
    pack: { names: pack.map((r) => r.offerName), budget: packBudget(pack) },
    script: parsed(scriptSchema, row.script) ?? EMPTY_SCRIPT,
    objections: listOf(objectionSchema, row.objections),
    email: parsed(emailAngleSchema, row.emailAngle),
    evidence: listOf(evidenceSchema, row.evidence),
    notes: row.notes,
    model: row.model,
    costEur: row.costMicros / 1_000_000,
  }
}

const requireAi = (actor: CurrentUser) => {
  if (!can(actor.role, "ai:use")) throw new LeadError("forbidden", "Votre rôle ne donne pas accès aux offres suggérées.", 403)
}

export async function getLeadPitch(actor: CurrentUser, leadId: string): Promise<LeadPitchState> {
  requireAi(actor)
  const lead = await visibleLead(actor, leadId)
  const [audit, row, run, failed, offers, worker] = await Promise.all([
    latestFor(actor.workspaceId, lead),
    prisma.offerPitch.findFirst({ where: { leadId: lead.id, workspaceId: actor.workspaceId }, orderBy: { createdAt: "desc" }, include: { recommendations: { orderBy: { rank: "asc" } } } }),
    prisma.agentRun.findFirst({ where: { leadId: lead.id, agentId: "offers", status: { in: [...ACTIVE_RUN_STATUSES] } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, createdAt: true, error: true } }),
    prisma.agentRun.findFirst({ where: { leadId: lead.id, agentId: "offers", status: { in: ["FAILED", "BUDGET_EXCEEDED", "EXPIRED"] } }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, finishedAt: true, error: true } }),
    activeOffers(actor.workspaceId),
    workerStatus(actor.workspaceId),
  ])
  const report = audit ? auditReportSchema.safeParse(audit.report) : null
  const candidates = report?.success ? candidatesFor(report.data, offers) : []
  const failure = failed && !run && (!row || failed.createdAt > row.createdAt) ? failed : null
  const writable = canAccessRecord(actor, "lead:write", lead.ownerId)
  return {
    pitch: row ? await toPitchView(row, audit?.id ?? null) : null,
    audit: audit ? { id: audit.id, createdAt: audit.createdAt.toISOString(), fresh: audit.validUntil > new Date() } : null,
    candidates: candidates.map((c) => ({ slug: c.offer.slug, name: c.offer.name, signals: c.signals.map((s) => signalLabel(s.key)) })),
    activeOffers: offers.length,
    run: run ? { id: run.id, status: run.status, createdAt: run.createdAt.toISOString(), error: run.error } : null,
    lastFailure: failure ? { runId: failure.id, at: (failure.finishedAt ?? failure.createdAt).toISOString(), error: failure.error ?? "Le pitch n’a pas abouti." } : null,
    canRun: writable && !!lead.companyId,
    canDecide: writable,
    canManageOffers: can(actor.role, "offer:manage"),
    configured: aiConfigured(),
    workerOnline: worker.online,
  }
}

/**
 * Starts the Conseiller offres on the fiche's current audit. Refused before anything is spent when there is nothing to
 * argue: no audit, no active offer, or no active offer the audit calls for.
 */
export async function requestPitch(actor: CurrentUser, leadId: string): Promise<{ runId: string }> {
  requireAi(actor)
  const lead = await visibleLead(actor, leadId)
  if (!canAccessRecord(actor, "lead:write", lead.ownerId)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée : l'IA ne peut pas y travailler pour vous.", 403)
  const audit = await latestFor(actor.workspaceId, lead)
  if (!audit) throw new LeadError("conflict", NO_AUDIT, 409)
  const report = auditReportSchema.safeParse(audit.report)
  if (!report.success) throw new LeadError("conflict", "Le rapport de l’audit est illisible : relancez l’audit.", 409)
  const offers = await activeOffers(actor.workspaceId)
  if (!offers.length) throw new LeadError("conflict", NO_ACTIVE_OFFER, 409)
  if (!candidatesFor(report.data, offers).length) throw new LeadError("conflict", NO_CANDIDATE, 409)
  const run = await startRun(actor, { agentId: "offers", leadId: lead.id, status: "QUEUED", input: { auditId: audit.id } })
  return { runId: run.id }
}

const DECISION_ACTIONS: Record<DecideInput["status"], string> = { ACCEPTED: "offer.recommendation_accepted", REJECTED: "offer.recommendation_rejected", SUGGESTED: "offer.recommendation_reset" }

/**
 * A person keeps or sets aside a suggested offer (or undoes it). Kept with who and when, and the reason of a refusal,
 * to measure the advisor's relevance (E27). An offer no longer active can still be set aside, not kept.
 */
export async function decideRecommendation(actor: CurrentUser, leadId: string, recommendationId: string, input: DecideInput, ip?: string | null): Promise<RecommendationView> {
  requireAi(actor)
  const lead = await visibleLead(actor, leadId)
  if (!canAccessRecord(actor, "lead:write", lead.ownerId)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée.", 403)
  const rec = await prisma.offerRecommendation.findFirst({ where: { id: recommendationId, workspaceId: actor.workspaceId, pitch: { leadId: lead.id } }, select: { id: true, pitchId: true, offerId: true, offerSlug: true, offerName: true, status: true } })
  if (!rec) throw new LeadError("not_found", "Offre suggérée introuvable", 404)
  if (input.status === "REJECTED" && !input.reason) throw new LeadError("invalid", "Dites pourquoi vous écartez cette offre.", 400)
  if (input.status === "ACCEPTED" && !(await activeOfferIds([rec.offerId])).size) throw new LeadError("conflict", `« ${rec.offerName} » n’est plus active dans le catalogue : elle ne peut plus être retenue.`, 409)
  const decided = input.status !== "SUGGESTED"
  const row = await prisma.offerRecommendation.update({
    where: { id: rec.id },
    data: {
      status: input.status,
      reason: input.status === "REJECTED" ? input.reason : null,
      note: input.status === "REJECTED" ? input.note || null : null,
      decidedById: decided ? actor.id : null,
      decidedAt: decided ? new Date() : null,
    },
  })
  await journal({
    action: DECISION_ACTIONS[input.status],
    actorId: actor.id,
    workspaceId: actor.workspaceId,
    entityType: "Lead",
    entityId: lead.id,
    metadata: { recommendationId: rec.id, pitchId: rec.pitchId, offer: rec.offerSlug, from: rec.status, ...(input.reason ? { reason: input.reason } : {}) },
    ip,
  })
  return toRecommendationView(row, await peopleNames([row.decidedById]), await activeOfferIds([row.offerId]))
}
