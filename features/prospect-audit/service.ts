import type { AgentRunStatus, AuditStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit as journal } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can, canAccessRecord } from "@/lib/rbac"
import { aiConfigured } from "@/lib/ai/gateway"
import { ACTIVE_RUN_STATUSES } from "@/lib/ai/budget"
import { LeadError } from "@/features/leads/errors"
import { scopeWhere } from "@/features/leads/service"
import { startRun } from "@/features/ai/runs"
import { workerStatus } from "@/features/ai/queue"
import { potentialOf } from "./labels"
import { latestFor } from "./latest"
import { AREAS, auditReportSchema, type AuditReport, type ProposedContact, type Scores } from "./schemas"

/**
 * Prospect audits in the CRM (E20, docs/crm-v1/AGENTS-IA.md §13): the latest one of a fiche (or of its domain, reused
 * for 30 days), starting one, its screenshots, and the officers it found, added as contacts by a person.
 */
export interface AuditView {
  id: string
  status: AuditStatus
  createdAt: string
  validUntil: string
  fresh: boolean
  url: string | null
  domain: string | null
  score: number | null
  potential: { level: "high" | "medium" | "low"; label: string } | null
  /** Sub-scores measured, out of 8: how much the overall score can be trusted. */
  measured: number
  scores: Scores
  summary: string[]
  report: AuditReport
  captures: ("mobile" | "desktop")[]
  costEur: number
  /** Made for another fiche of the same domain. */
  shared: boolean
  people: (ProposedContact & { added: boolean })[]
}

export interface LeadAuditState {
  audit: AuditView | null
  run: { id: string; status: AgentRunStatus; createdAt: string; error: string | null } | null
  /** The last audit that did not finish, when nothing newer replaced it: why, in words for the person. */
  lastFailure: { runId: string; at: string; error: string } | null
  canRun: boolean
  configured: boolean
  workerOnline: boolean
}

const emptyScores = () => Object.fromEntries(AREAS.map((a) => [a, null])) as Scores

/** The fiche, if the person may see it, with what tells which audit it shows. */
export async function visibleLead(actor: CurrentUser, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, workspaceId: actor.workspaceId, ...scopeWhere(actor, "lead:read") },
    select: { id: true, ownerId: true, contactId: true, companyId: true, company: { select: { domain: true, website: true } } },
  })
  if (!lead) throw new LeadError("not_found", "Fiche introuvable.", 404)
  return lead
}

async function toView(row: NonNullable<Awaited<ReturnType<typeof latestFor>>>, lead: { id: string; companyId: string | null }, now = new Date()): Promise<AuditView> {
  const parsed = auditReportSchema.safeParse(row.report)
  const report: AuditReport = parsed.success
    ? parsed.data
    : { findings: [], strengths: [], frictions: [], opportunities: [], signals: [], evidence: [], people: [], registry: null, site: null, notes: ["Rapport illisible : relancez l'audit."], models: { extraction: null, analysis: null } }
  const scores = { ...emptyScores(), ...((row.scores ?? {}) as Partial<Scores>) }
  const existing = lead.companyId && report.people.length ? await prisma.contact.findMany({ where: { companyId: lead.companyId }, select: { name: true } }) : []
  const names = new Set(existing.map((c) => c.name?.toLowerCase()).filter(Boolean))
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    validUntil: row.validUntil.toISOString(),
    fresh: row.validUntil > now,
    url: row.url,
    domain: row.domain,
    score: row.score,
    potential: potentialOf(row.score),
    measured: AREAS.filter((a) => typeof scores[a] === "number").length,
    scores,
    summary: row.summary,
    report,
    captures: row.captures.map((c) => c.kind).filter((k): k is "mobile" | "desktop" => k === "mobile" || k === "desktop"),
    costEur: row.costMicros / 1_000_000,
    shared: row.leadId !== lead.id,
    people: report.people.map((p) => ({ ...p, added: names.has(p.name.toLowerCase()) })),
  }
}

export async function getLeadAudit(actor: CurrentUser, leadId: string): Promise<LeadAuditState> {
  if (!can(actor.role, "ai:read")) throw new LeadError("forbidden", "Accès refusé", 403)
  const lead = await visibleLead(actor, leadId)
  const [row, run, failed, worker] = await Promise.all([
    latestFor(actor.workspaceId, lead),
    prisma.agentRun.findFirst({ where: { leadId, agentId: "auditor", status: { in: [...ACTIVE_RUN_STATUSES] } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, createdAt: true, error: true } }),
    prisma.agentRun.findFirst({ where: { leadId, agentId: "auditor", status: { in: ["FAILED", "BUDGET_EXCEEDED", "EXPIRED"] } }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, finishedAt: true, error: true } }),
    workerStatus(actor.workspaceId),
  ])
  const failure = failed && !run && (!row || failed.createdAt > row.createdAt) ? failed : null
  return {
    audit: row ? await toView(row, lead) : null,
    run: run ? { id: run.id, status: run.status, createdAt: run.createdAt.toISOString(), error: run.error } : null,
    lastFailure: failure ? { runId: failure.id, at: (failure.finishedAt ?? failure.createdAt).toISOString(), error: failure.error ?? "L'audit n'a pas abouti." } : null,
    canRun: can(actor.role, "ai:use") && canAccessRecord(actor, "lead:write", lead.ownerId) && !!lead.companyId,
    configured: aiConfigured(),
    workerOnline: worker.online,
  }
}

/**
 * Starts an audit, unless a fresh one already covers the fiche's domain: then it is reused and nothing is spent.
 * `force` audits again anyway (the site changed).
 */
export async function requestAudit(actor: CurrentUser, leadId: string, opts: { force?: boolean } = {}): Promise<{ reused: true; auditId: string } | { reused: false; runId: string }> {
  if (!can(actor.role, "ai:use")) throw new LeadError("forbidden", "Votre rôle ne permet pas de lancer l'IA.", 403)
  const lead = await visibleLead(actor, leadId)
  // Reusing costs nothing, but asking for an audit is still working on the fiche.
  if (!canAccessRecord(actor, "lead:write", lead.ownerId)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée : l'IA ne peut pas y travailler pour vous.", 403)
  if (!lead.companyId) throw new LeadError("invalid", "La fiche n'a pas d'entreprise à auditer.", 400)
  if (!opts.force) {
    const fresh = await latestFor(actor.workspaceId, lead)
    if (fresh && fresh.validUntil > new Date()) return { reused: true, auditId: fresh.id }
  }
  const run = await startRun(actor, { agentId: "auditor", leadId, status: "QUEUED", input: { force: !!opts.force } })
  return { reused: false, runId: run.id }
}

/** A screenshot, for whoever sees the fiche it is shown on. */
export async function auditCapture(actor: CurrentUser, auditId: string, kind: string, viaLeadId: string): Promise<{ data: Uint8Array; mediaType: string }> {
  if (!can(actor.role, "ai:read")) throw new LeadError("forbidden", "Accès refusé", 403)
  const lead = await visibleLead(actor, viaLeadId)
  const row = await latestFor(actor.workspaceId, lead)
  // Only the audit the fiche shows: the latest of its own, or the fresh one of its domain.
  const allowed = row?.id === auditId || (await prisma.prospectAudit.count({ where: { id: auditId, workspaceId: actor.workspaceId, leadId: lead.id } })) > 0
  if (!allowed) throw new LeadError("not_found", "Capture introuvable", 404)
  const capture = await prisma.prospectAuditCapture.findUnique({ where: { auditId_kind: { auditId, kind } }, select: { data: true, mediaType: true } })
  if (!capture) throw new LeadError("not_found", "Capture introuvable", 404)
  return { data: capture.data, mediaType: capture.mediaType }
}

/**
 * Adds an officer found by the audit as a contact of the company, with its source and legal basis: a person decides,
 * the audit only proposes. The fiche takes this contact when it has none.
 */
export async function addProposedContact(actor: CurrentUser, leadId: string, auditId: string, index: number, ip?: string | null): Promise<{ contactId: string; linked: boolean }> {
  const lead = await visibleLead(actor, leadId)
  if (!canAccessRecord(actor, "lead:write", lead.ownerId)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée.", 403)
  if (!lead.companyId) throw new LeadError("invalid", "La fiche n'a pas d'entreprise.", 400)
  const row = await latestFor(actor.workspaceId, lead)
  if (!row || row.id !== auditId) throw new LeadError("conflict", "Cet audit n'est plus celui de la fiche : rechargez la page.", 409)
  const view = await toView(row, lead)
  const person = view.people[index]
  if (!person) throw new LeadError("not_found", "Dirigeant introuvable dans l'audit.", 404)
  if (person.added) throw new LeadError("conflict", `${person.name} est déjà un contact de cette entreprise.`, 409)
  const result = await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({
      data: {
        workspaceId: actor.workspaceId,
        companyId: lead.companyId,
        name: person.name,
        jobTitle: person.role,
        source: "MANUAL",
        collectedFrom: `${person.source} (proposé par l'audit IA)`.slice(0, 500),
        collectedAt: new Date(person.collectedAt),
        legalBasis: person.legalBasis,
      },
      select: { id: true },
    })
    const linked = !lead.contactId
    if (linked) await tx.lead.update({ where: { id: lead.id }, data: { contactId: contact.id } })
    return { contactId: contact.id, linked }
  })
  await journal({ action: "lead.contact_added_from_audit", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "Lead", entityId: lead.id, metadata: { auditId, contactId: result.contactId, linked: result.linked }, ip })
  return result
}
