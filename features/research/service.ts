import type { AgentRunStatus, CandidateStatus, ContactRole, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can, canAccessRecord } from "@/lib/rbac"
import { normalizeName } from "@/lib/crm/normalize"
import { aiConfigured } from "@/lib/ai/gateway"
import { ACTIVE_RUN_STATUSES, microsToEur } from "@/lib/ai/budget"
import { LeadError } from "@/features/leads/errors"
import { scopeWhere } from "@/features/leads/service"
import { workerStatus } from "@/features/ai/queue"
import { startRun } from "@/features/ai/runs"
import { visibleLead } from "@/features/prospect-audit/service"
import { legallyBlocked } from "@/features/signals/kinds"
import { briefContentSchema, briefSourceSchema, type BriefContent, type BriefSource } from "./brief-schemas"
import { BRIEF_CAP_MICROS } from "./brief"
import { GEO_CAP_MICROS, geoOf, tradeOf, type GeoFinding } from "./geo"
import { NETWORK_LABELS, type ResearchJob } from "./labels"
import { PEOPLE_BATCH, PEOPLE_FICHE_CAP_MICROS, PEOPLE_REFRESH_DAYS } from "./people"

/**
 * The Enquêteur on the fiche and the campaign (E30 lot 2): what it found, what it is doing, and the clicks that start
 * it or turn a profile into a contact. Searches cost money: every start goes through the agent's run, its cap and the
 * month's budget; a profile becomes a contact only on a person's click (D18, D48).
 */
export const RESEARCH_LEGAL_BASIS = "Intérêt légitime (RGPD art. 6.1.f) : prospection B2B d'un décideur, profil professionnel public"
export const RESEARCH_SOURCE = "Exa (index de profils professionnels publics)"
/** A campaign's search: fifty fiches at most per click, in runs of ten. */
export const CAMPAIGN_PEOPLE_MAX = 50

const DAY = 86_400_000
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

export interface CandidateView {
  id: string
  role: ContactRole
  name: string
  title: string | null
  url: string
  confidence: number
  evidence: string
  status: CandidateStatus
  createdAt: string
}

export interface ResearchView {
  candidates: CandidateView[]
  /** The company's accounts: those of the Extractor, and those the Enquêteur found, with their provenance. */
  socials: { network: string; label: string; url: string; found: { at: string; confidence: number; onSite: boolean } | null }[]
  peopleCheckedAt: string | null
  geo: GeoFinding | null
  brief: { id: string; createdAt: string; meeting: BriefContent["meeting"]; content: BriefContent; sources: BriefSource[]; dropped: number; costEur: number } | null
  /** The Enquêteur's work on this fiche now, by job. */
  running: { id: string; job: ResearchJob; status: AgentRunStatus }[]
  lastFailure: { job: ResearchJob; at: string; error: string } | null
  /** Why the GEO probe cannot run, if it cannot. */
  geoBlocked: string | null
  /** The fiche's next meeting, which a brief would prepare. */
  nextMeeting: { id: string; startsAt: string } | null
  can: { run: boolean; write: boolean }
  configured: boolean
  worker: { online: boolean }
}

const jobOf = (input: unknown): ResearchJob | null => {
  const job = isObj(input) ? input.job : null
  return job === "people" || job === "brief" || job === "geo" ? job : null
}

async function companyLead(actor: CurrentUser, leadId: string) {
  const lead = await visibleLead(actor, leadId)
  if (!lead.companyId) throw new LeadError("invalid", "La fiche n'a pas d'entreprise.", 400)
  return lead as typeof lead & { companyId: string }
}

export async function researchView(actor: CurrentUser, leadId: string): Promise<ResearchView> {
  const lead = await companyLead(actor, leadId)
  const [c, candidates, brief, runs, failed, worker, meeting] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: lead.companyId }, select: { sector: true, city: true, data: true, peopleCheckedAt: true, legalState: true, legalStateAt: true, legalOverrideAt: true } }),
    prisma.contactCandidate.findMany({ where: { companyId: lead.companyId, status: { in: ["PROBABLE", "TO_CHECK", "CONFIRMED"] } }, orderBy: [{ status: "asc" }, { confidence: "desc" }], take: 12 }),
    prisma.leadBrief.findFirst({ where: { leadId }, orderBy: { createdAt: "desc" } }),
    prisma.agentRun.findMany({ where: { leadId, agentId: "researcher", status: { in: [...ACTIVE_RUN_STATUSES] } }, select: { id: true, status: true, input: true } }),
    prisma.agentRun.findFirst({ where: { leadId, agentId: "researcher", status: { in: ["FAILED", "BUDGET_EXCEEDED", "EXPIRED"] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true, finishedAt: true, error: true, input: true } }),
    workerStatus(actor.workspaceId),
    prisma.meeting.findFirst({ where: { leadId, status: "SCHEDULED", startsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" }, select: { id: true, startsAt: true } }),
  ])
  const data = isObj(c.data) ? c.data : {}
  const found = isObj(data.socialsFound) ? data.socialsFound : {}
  const socials = Object.entries(isObj(data.socials) ? data.socials : {}).flatMap(([network, url]) => {
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) return []
    const f = isObj(found[network]) ? (found[network] as Record<string, unknown>) : null
    return [{ network, label: NETWORK_LABELS[network] ?? network, url, found: f && f.url === url ? { at: String(f.foundAt), confidence: Number(f.confidence), onSite: f.source === "site" } : null }]
  })
  const content = brief ? briefContentSchema.safeParse(brief.content) : null
  const sources = brief ? briefSourceSchema.array().safeParse(brief.sources) : null
  const failedJob = failed ? jobOf(failed.input) : null
  const settledAfter = (at: Date) => (job: ResearchJob) => job === "brief" ? !!brief && brief.createdAt > at : job === "people" ? !!c.peopleCheckedAt && c.peopleCheckedAt > at : !!geoOf(c.data) && new Date(geoOf(c.data)!.checkedAt) > at
  return {
    candidates: candidates.map((k) => ({ id: k.id, role: k.role, name: k.name, title: k.title, url: k.url, confidence: k.confidence, evidence: k.evidence, status: k.status, createdAt: k.createdAt.toISOString() })),
    socials,
    peopleCheckedAt: c.peopleCheckedAt?.toISOString() ?? null,
    geo: geoOf(c.data),
    brief: brief && content?.success ? { id: brief.id, createdAt: brief.createdAt.toISOString(), meeting: content.data.meeting, content: content.data, sources: sources?.success ? sources.data : [], dropped: brief.dropped, costEur: microsToEur(brief.costMicros) } : null,
    running: runs.flatMap((r) => (jobOf(r.input) ? [{ id: r.id, job: jobOf(r.input)!, status: r.status }] : [])),
    lastFailure: failed && failedJob && !runs.some((r) => jobOf(r.input) === failedJob) && !settledAfter(failed.createdAt)(failedJob) ? { job: failedJob, at: (failed.finishedAt ?? failed.createdAt).toISOString(), error: failed.error ?? "Le travail n'a pas abouti." } : null,
    nextMeeting: meeting ? { id: meeting.id, startsAt: meeting.startsAt.toISOString() } : null,
    geoBlocked: !tradeOf(c.sector) ? "Le métier de l'entreprise n'est pas renseigné." : !c.city ? "La ville de l'entreprise n'est pas renseignée." : legallyBlocked(c) ? "Entreprise en procédure collective ou fermée." : null,
    can: { run: can(actor.role, "ai:use") && canAccessRecord(actor, "lead:write", lead.ownerId), write: canAccessRecord(actor, "lead:write", lead.ownerId) },
    configured: aiConfigured(),
    worker: { online: worker.online },
  }
}

/** Starts a job of the Enquêteur on the fiche: the person's right to use AI and to work on it are checked by startRun. */
export async function requestResearch(actor: CurrentUser, leadId: string, job: ResearchJob, opts: { meetingId?: string | null } = {}): Promise<{ runId: string }> {
  if (!can(actor.role, "ai:use")) throw new LeadError("forbidden", "Votre rôle ne permet pas de lancer l'IA.", 403)
  const lead = await companyLead(actor, leadId)
  const c = await prisma.company.findUniqueOrThrow({ where: { id: lead.companyId }, select: { sector: true, city: true, legalState: true, legalStateAt: true, legalOverrideAt: true } })
  if (job !== "brief" && legallyBlocked(c)) throw new LeadError("conflict", "Entreprise en procédure collective ou fermée : elle n'est pas prospectée.", 409)
  if (job === "geo" && (!tradeOf(c.sector) || !c.city)) throw new LeadError("invalid", "La sonde GEO a besoin du métier et de la ville de l'entreprise : complétez la fiche.", 400)
  let meetingId: string | null = null
  if (job === "brief" && opts.meetingId) {
    const meeting = await prisma.meeting.findFirst({ where: { id: opts.meetingId, leadId, workspaceId: actor.workspaceId }, select: { id: true } })
    if (!meeting) throw new LeadError("not_found", "Rendez-vous introuvable sur cette fiche.", 404)
    meetingId = meeting.id
  }
  const input = job === "people" ? { job, leadIds: [leadId], force: true } : job === "brief" ? { job, ...(meetingId ? { meetingId } : {}) } : { job }
  const capMicros = job === "people" ? PEOPLE_FICHE_CAP_MICROS : job === "geo" ? GEO_CAP_MICROS : BRIEF_CAP_MICROS
  const run = await startRun(actor, { agentId: "researcher", leadId, status: "QUEUED", priority: job === "brief" ? 2 : 1, input, capMicros })
  return { runId: run.id }
}

/**
 * A person confirms a profile: it completes the contact of the same name, or becomes a new contact of the company, with
 * its source and legal basis (never an email, D48). Or they dismiss it, and it is not proposed again.
 */
export async function decideCandidate(actor: CurrentUser, leadId: string, candidateId: string, decision: "confirm" | "dismiss", ip?: string | null): Promise<{ contactId: string | null }> {
  const lead = await companyLead(actor, leadId)
  if (!canAccessRecord(actor, "lead:write", lead.ownerId)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée.", 403)
  const candidate = await prisma.contactCandidate.findFirst({ where: { id: candidateId, companyId: lead.companyId, status: { in: ["PROBABLE", "TO_CHECK"] } } })
  if (!candidate) throw new LeadError("not_found", "Profil introuvable ou déjà traité.", 404)
  const now = new Date()
  if (decision === "dismiss") {
    await prisma.contactCandidate.update({ where: { id: candidate.id }, data: { status: "DISMISSED", decidedById: actor.id, decidedAt: now } })
    await audit({ action: "lead.candidate_dismissed", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "Lead", entityId: lead.id, metadata: { candidateId: candidate.id, role: candidate.role }, ip })
    return { contactId: null }
  }
  const result = await prisma.$transaction(async (tx) => {
    const contacts = await tx.contact.findMany({ where: { companyId: lead.companyId }, select: { id: true, name: true, jobTitle: true, role: true, linkedinUrl: true } })
    const same = contacts.find((k) => normalizeName(k.name) === normalizeName(candidate.name))
    let contactId: string
    if (same) {
      await tx.contact.update({ where: { id: same.id }, data: { linkedinUrl: candidate.url, ...(same.jobTitle ? {} : { jobTitle: candidate.title }), ...(same.role === "OTHER" ? { role: candidate.role } : {}) } })
      contactId = same.id
    } else {
      const created = await tx.contact.create({
        data: {
          workspaceId: actor.workspaceId,
          companyId: lead.companyId,
          name: candidate.name,
          jobTitle: candidate.title,
          role: candidate.role,
          linkedinUrl: candidate.url,
          source: "RESEARCH",
          collectedFrom: `${RESEARCH_SOURCE} : ${candidate.url}`.slice(0, 500),
          collectedAt: candidate.createdAt,
          legalBasis: RESEARCH_LEGAL_BASIS,
        },
        select: { id: true },
      })
      contactId = created.id
    }
    await tx.contactCandidate.update({ where: { id: candidate.id }, data: { status: "CONFIRMED", contactId, decidedById: actor.id, decidedAt: now } })
    const linked = !lead.contactId
    if (linked) await tx.lead.update({ where: { id: lead.id }, data: { contactId } })
    return { contactId, completed: !!same, linked }
  })
  await audit({ action: "lead.candidate_confirmed", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "Lead", entityId: lead.id, metadata: { candidateId: candidate.id, role: candidate.role, ...result }, ip })
  return { contactId: result.contactId }
}

// ── A campaign's good targets ──────────────────────────────────────────────────────────────────────────────────

/** The good targets of a campaign (Jev's verdict or a person's) the person may work on, not searched this month. */
function eligibleWhere(actor: CurrentUser, campaignId: string, now: Date): Prisma.LeadWhereInput {
  return {
    workspaceId: actor.workspaceId,
    ...scopeWhere(actor, "lead:write"),
    status: { notIn: ["DISQUALIFIED", "DO_NOT_CONTACT"] },
    relevances: { some: { campaignId, OR: [{ decision: "RELEVANT" }, { decision: null, verdict: "RELEVANT" }] } },
    company: { is: { legalState: "ACTIVE", OR: [{ peopleCheckedAt: null }, { peopleCheckedAt: { lt: new Date(now.getTime() - PEOPLE_REFRESH_DAYS * DAY) } }] } },
  }
}

export interface PeopleQuote {
  eligible: number
  /** Searched now: fifty at most. */
  batch: number
  /** What the batch usually costs, and the most it may cost (each run's cap). */
  typicalEur: number
  maxEur: number
}

const TYPICAL_FICHE_MICROS = 20_000

async function campaignOf(actor: CurrentUser, campaignId: string) {
  if (!can(actor.role, "ai:use")) throw new LeadError("forbidden", "Votre rôle ne permet pas de lancer l'IA.", 403)
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId: actor.workspaceId }, select: { id: true, name: true, archivedAt: true } })
  if (!campaign) throw new LeadError("not_found", "Campagne introuvable.", 404)
  return campaign
}

/** « Devis » before searching a campaign's decision makers: how many fiches, and what it costs. Nothing is spent. */
export async function campaignPeopleQuote(actor: CurrentUser, campaignId: string, now = new Date()): Promise<PeopleQuote> {
  await campaignOf(actor, campaignId)
  const eligible = await prisma.lead.count({ where: eligibleWhere(actor, campaignId, now) })
  const batch = Math.min(eligible, CAMPAIGN_PEOPLE_MAX)
  return { eligible, batch, typicalEur: microsToEur(batch * TYPICAL_FICHE_MICROS), maxEur: microsToEur(batch * PEOPLE_FICHE_CAP_MICROS) }
}

/**
 * Searches the decision makers of a campaign's good targets, fifty at most, in runs of ten: each run holds its own cap,
 * so the day's quota and the month's budget refuse what they cannot pay before anything is spent.
 */
export async function launchCampaignPeople(actor: CurrentUser, campaignId: string, ip?: string | null, now = new Date()): Promise<{ runs: number; fiches: number; refused: string | null }> {
  const campaign = await campaignOf(actor, campaignId)
  if (campaign.archivedAt) throw new LeadError("conflict", "Cette campagne est archivée.", 409)
  const leads = await prisma.lead.findMany({ where: eligibleWhere(actor, campaignId, now), select: { id: true }, orderBy: { createdAt: "asc" }, take: CAMPAIGN_PEOPLE_MAX })
  if (!leads.length) throw new LeadError("conflict", "Aucune bonne cible à chercher : elles l'ont toutes été ce mois-ci, ou Jev n'a pas encore trié la campagne.", 409)
  let runs = 0
  let fiches = 0
  let refused: string | null = null
  for (let i = 0; i < leads.length; i += PEOPLE_BATCH) {
    const ids = leads.slice(i, i + PEOPLE_BATCH).map((l) => l.id)
    try {
      await startRun(actor, { agentId: "researcher", campaignId, status: "QUEUED", priority: 0, input: { job: "people", leadIds: ids, campaignId }, capMicros: ids.length * PEOPLE_FICHE_CAP_MICROS })
    } catch (error) {
      // The budget or the quota refused this run: the ones already queued go on.
      if (!runs) throw error
      refused = error instanceof Error ? error.message : String(error)
      break
    }
    runs++
    fiches += ids.length
  }
  await audit({ action: "campaign.people_search", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "Campaign", entityId: campaign.id, metadata: { runs, fiches, refused: !!refused }, ip })
  return { runs, fiches, refused }
}

/** The share of profiles a person confirmed among those they decided (E27): how often the Enquêteur's finds are right. */
export async function confirmationRate(workspaceId: string, since: Date): Promise<{ confirmed: number; dismissed: number; rate: number | null }> {
  const rows = await prisma.contactCandidate.groupBy({ by: ["status"], where: { workspaceId, decidedAt: { gte: since }, status: { in: ["CONFIRMED", "DISMISSED"] } }, _count: { _all: true } })
  const confirmed = rows.find((r) => r.status === "CONFIRMED")?._count._all ?? 0
  const dismissed = rows.find((r) => r.status === "DISMISSED")?._count._all ?? 0
  return { confirmed, dismissed, rate: confirmed + dismissed ? confirmed / (confirmed + dismissed) : null }
}
