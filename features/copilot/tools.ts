import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { addDays, dayBounds } from "@/lib/crm/day"
import { campaignStatus, dealStage, leadStatus, meetingStatus } from "@/lib/crm/status"
import { untrusted } from "@/lib/ai/untrusted"
import { LeadError } from "@/features/leads/errors"
import { addActivity, getLead, listLeads, scopeWhere } from "@/features/leads/service"
import { parseLeadFilters, SORTS } from "@/features/leads/schemas"
import { LEAD_STATUSES } from "@/features/leads/types"
import { createTask } from "@/features/activity/tasks"
import { getToday } from "@/features/activity/today"
import { listMeetings } from "@/features/meetings/service"
import { MEETING_TYPE_LABELS } from "@/features/meetings/rules"
import { listBoard } from "@/features/pipeline/service"
import { OPEN_STAGES } from "@/features/pipeline/rules"
import { getCampaign, listCampaigns } from "@/features/campaigns/service"
import { latestFor } from "@/features/prospect-audit/latest"
import { getLeadAudit, requestAudit } from "@/features/prospect-audit/service"
import { AREA_LABELS } from "@/features/prospect-audit/labels"
import { AREAS } from "@/features/prospect-audit/schemas"
import { getLeadPitch, requestPitch } from "@/features/offer-pitch/service"
import { requestFirstDraft } from "@/features/email-draft/service"
import { getLeadStudio, startStudio } from "@/features/studio/service"
import { STATE_LABELS } from "@/features/studio/labels"
import { effectiveAgent } from "@/features/ai/definitions"
import { readSkillTool } from "@/features/ai/runtime"
import { defineTool, type AnyToolDef, type ToolContext } from "@/features/ai/tools"
import type { AgentId } from "@/features/ai/agents"

/**
 * What the copilot works with (E24, docs/crm-v1/AGENTS-IA.md §17). Every tool calls an existing service as the person
 * the conversation belongs to, so it sees and does exactly what that person may: the copilot never sees more than they
 * do. Reading runs on its own. Everything else waits for the person's click in the conversation: a note, a task, and
 * the work handed to the specialists (audit, offers, draft, mock-up), which runs in the worker and shows as a live card.
 *
 * Outputs are written for the model: short, in French, without the contact's email or phone (they stay on the fiche).
 */

const leadId = z.string().min(1).max(64).describe("Identifiant de la fiche (leadId)")
const iso = (d: string | null | undefined) => (d ? d.slice(0, 10) : null)
const clip = (s: string | null | undefined, max: number) => (s ? (s.length > max ? `${s.slice(0, max)}…` : s) : null)
const euros = (cents: number | null) => (cents == null ? null : Math.round(cents / 100))
/** A status in words; an unknown value stays readable. */
const labelOf = (map: Record<string, { label: string } | string>, key: string) => {
  const v = map[key]
  return typeof v === "string" ? v : v?.label ?? key
}
const eur = (micros: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(micros / 1_000_000)

function personOf(ctx: ToolContext): CurrentUser {
  const user = ctx.run.requester
  if (!user) throw new LeadError("forbidden", "Le copilote travaille toujours pour une personne.", 403)
  return user
}

/** A fiche's name, if the person may see it: what an approval shows. */
async function visibleName(user: CurrentUser, id: string): Promise<string> {
  const lead = await prisma.lead.findFirst({
    where: { id, workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") },
    select: { company: { select: { name: true } }, contact: { select: { name: true } } },
  })
  if (!lead) throw new LeadError("not_found", "Fiche introuvable pour cette personne : vérifie le leadId avec search_leads.", 404)
  return lead.company?.name ?? lead.contact?.name ?? "Sans nom"
}

/** The cap a specialist reserves when it starts: the person approves knowing the most it can cost. */
async function capOf(user: CurrentUser, agentId: AgentId): Promise<string> {
  return eur((await effectiveAgent(user.workspaceId, agentId)).capMicros)
}

const formatDay = (key: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`))

// ---------------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------------

export const searchLeadsTool = defineTool({
  name: "search_leads",
  description:
    "Cherche des fiches parmi celles que la personne voit : texte libre (nom, ville, domaine, contact, étiquette), statut, ville, secteur, campagne, les siennes, score minimum. Rend 10 fiches au plus, avec le total. Utilise-le aussi pour retrouver un leadId à partir d'un nom.",
  permission: "lead:read",
  approval: "auto",
  costClass: "free",
  input: z.object({
    query: z.string().max(200).optional().describe("Texte libre : nom, ville, domaine, contact ou étiquette"),
    status: z.array(z.enum(LEAD_STATUSES)).max(6).optional().describe("NEW (Nouveau), CONTACTED (Contacté), REPLIED (A répondu), QUALIFIED (Qualifié), DISQUALIFIED (Non qualifié), DO_NOT_CONTACT (Ne pas contacter)"),
    city: z.string().max(100).optional(),
    sector: z.string().max(100).optional(),
    campaignId: z.string().max(64).optional().describe("Identifiant d'une campagne, ou « none » pour les fiches hors campagne"),
    mine: z.boolean().optional().describe("Seulement les fiches attribuées à la personne"),
    minScore: z.number().int().min(0).max(100).optional(),
    sort: z.enum(SORTS).optional().describe("score (défaut), created, name, contacted, status"),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  execute: async (ctx, input) => {
    const filters = parseLeadFilters({
      q: input.query,
      status: input.status?.join(","),
      city: input.city,
      sector: input.sector,
      campaign: input.campaignId,
      owner: input.mine ? "me" : undefined,
      minScore: input.minScore ? String(input.minScore) : undefined,
      sort: input.sort,
      pageSize: String(input.limit ?? 10),
    })
    const list = await listLeads(personOf(ctx), filters)
    return {
      total: list.total,
      leads: list.rows.map((r) => ({
        leadId: r.id,
        name: r.name,
        city: r.city,
        sector: r.sector,
        status: leadStatus[r.status].label,
        score: r.score,
        owner: r.ownerName,
        contact: r.contactName,
        lastContact: iso(r.lastContactedAt),
      })),
    }
  },
})

export const getLeadTool = defineTool({
  name: "get_lead",
  description:
    "Lit une fiche : entreprise, contact (nom et fonction ; l'email et le téléphone restent sur la fiche), statut, score et ses raisons, campagne, opportunités, rendez-vous, tâches ouvertes, derniers échanges, et l'état de l'IA (audit, offres, maquette).",
  permission: "lead:read",
  approval: "auto",
  costClass: "free",
  input: z.object({ leadId }),
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    const l = await getLead(user, input.leadId)
    const studio = l.can.studio ? await getLeadStudio(user, l.id).catch(() => null) : null
    return {
      leadId: l.id,
      name: l.company?.name ?? l.contact?.name ?? "Sans nom",
      status: leadStatus[l.status].label,
      score: l.score,
      scoreReasons: l.scoreReasons.map((r) => r.label).slice(0, 8),
      owner: l.ownerName,
      campaign: l.campaign?.name ?? null,
      tags: l.tags,
      lastContact: iso(l.lastContactedAt),
      company: l.company && {
        city: l.company.city,
        sector: l.company.sector,
        website: l.company.website,
        phone: l.company.phone,
        googleRating: l.company.rating,
        googleReviews: l.company.reviewCount,
      },
      contact: l.contact && {
        name: l.contact.name,
        jobTitle: l.contact.jobTitle,
        hasEmail: !!l.contact.email,
        hasPhone: !!l.contact.phone,
        doNotContact: l.contact.doNotContact,
      },
      deals: l.deals.map((d) => ({ stage: labelOf(dealStage, d.stage), amountEur: euros(d.amountCents), expectedClose: iso(d.expectedCloseAt), owner: d.ownerName })),
      meetings: l.meetings.slice(0, 5).map((m) => ({ startsAt: m.startsAt, type: labelOf(MEETING_TYPE_LABELS, m.type), status: labelOf(meetingStatus, m.status), host: m.hostName })),
      openTasks: l.tasks.slice(0, 8).map((t) => ({ title: t.title, due: iso(t.dueAt), assignee: t.assigneeName })),
      history: l.activities.slice(0, 8).map((a) => ({
        at: a.occurredAt.slice(0, 16),
        kind: a.kind,
        by: a.actorKind === "USER" ? a.actorName : a.actorKind,
        // An email's text may come from the prospect: data, never instructions.
        text: a.body ? (a.kind === "EMAIL" ? untrusted(a.body, { source: "email de la fiche", maxChars: 300 }) : clip(a.body, 300)) : a.event ?? a.outcome,
      })),
      ai: {
        audit: l.aiReason?.label ?? null,
        offers: l.pitch ? `${l.pitch.offers} offre(s) suggérée(s) le ${iso(l.pitch.createdAt)}` : null,
        mockup: studio?.site ? STATE_LABELS[studio.site.state] : null,
      },
      canDo: { write: l.can.write, email: l.can.email, audit: l.can.audit, offers: l.can.offers, studio: l.can.studio },
    }
  },
})

export const getLeadAuditTool = defineTool({
  name: "get_lead_audit",
  description: "Lit l'audit IA de la fiche (site, vitesse, mobile, SEO local, GEO, conversion, présence, image) : notes par volet, résumé, constats principaux. À lire avant de proposer un nouvel audit.",
  permission: "ai:read",
  approval: "auto",
  costClass: "free",
  input: z.object({ leadId }),
  execute: async (ctx, input) => {
    const state = await getLeadAudit(personOf(ctx), input.leadId)
    const a = state.audit
    const running = state.run ? `Un audit est en cours (lancé le ${iso(state.run.createdAt)}).` : null
    if (!a) return { audit: null, note: running ?? state.lastFailure?.error ?? "Aucun audit pour cette fiche." }
    const order = { high: 0, medium: 1, low: 2 }
    return {
      date: iso(a.createdAt),
      fresh: a.fresh,
      site: a.url,
      score: a.score,
      potential: a.potential?.label ?? null,
      scores: Object.fromEntries(AREAS.map((k) => [AREA_LABELS[k], a.scores[k]])),
      summary: a.summary,
      findings: [...a.report.findings]
        .sort((x, y) => order[x.severity] - order[y.severity])
        .slice(0, 8)
        .map((f) => ({ area: AREA_LABELS[f.area], severity: f.severity, title: f.title, detail: clip(f.detail, 280) })),
      strengths: a.report.strengths.slice(0, 4).map((p) => p.text),
      note: running,
    }
  },
})

export const getLeadOffersTool = defineTool({
  name: "get_lead_offers",
  description: "Lit les offres suggérées à la fiche par le Conseiller (catalogue de l'agence) : accroche, offres classées avec leur prix et leur raison, pack, angle d'email.",
  permission: "ai:use",
  approval: "auto",
  costClass: "free",
  input: z.object({ leadId }),
  execute: async (ctx, input) => {
    const state = await getLeadPitch(personOf(ctx), input.leadId)
    const p = state.pitch
    if (!p) return { pitch: null, note: state.run ? "Le Conseiller travaille sur cette fiche." : state.activeOffers ? "Aucune offre suggérée pour l'instant." : "Aucune offre n'est active dans le catalogue." }
    return {
      date: iso(p.createdAt),
      headline: p.headline,
      offers: p.recommendations.map((r) => ({ offer: r.offer.name, price: r.offer.price, role: r.role, fit: r.fit, why: clip(r.why, 280), status: r.status })),
      pack: p.pack,
      emailAngle: p.email ? { subject: p.email.subject, angle: clip(p.email.angle, 400) } : null,
      stale: p.stale,
    }
  },
})

export const getTodayTool = defineTool({
  name: "get_today",
  description: "La journée de la personne : tâches en retard, du jour et à venir, rendez-vous du jour, rendez-vous à clôturer, fiches suggérées (réponses, opportunités sans suite). « team » pour toute l'équipe, si elle la voit.",
  permission: "lead:read",
  approval: "auto",
  costClass: "free",
  input: z.object({ scope: z.enum(["mine", "team"]).optional() }),
  execute: async (ctx, input) => {
    const t = await getToday(personOf(ctx), input.scope ?? "mine")
    const task = (x: (typeof t.overdue)[number]) => ({ leadId: x.leadId, name: x.leadName, task: x.title, due: iso(x.dueAt), assignee: x.assigneeName })
    return {
      day: t.today,
      scope: t.scope,
      overdue: t.overdue.slice(0, 12).map(task),
      dueToday: t.dueToday.slice(0, 12).map(task),
      upcoming: t.upcoming.slice(0, 8).map(task),
      meetings: t.meetings.map((m) => ({ leadId: m.leadId, name: m.leadName, startsAt: m.startsAt, host: m.hostName })),
      meetingsToClose: t.meetingsToClose.map((m) => ({ leadId: m.leadId, name: m.leadName, startsAt: m.startsAt })),
      suggestions: t.suggestions.slice(0, 8).map((s) => ({ leadId: s.leadId, name: s.leadName, why: s.detail })),
      counts: { overdue: t.overdue.length, dueToday: t.dueToday.length, upcoming: t.upcoming.length, undated: t.undated.length },
    }
  },
})

export const listMeetingsTool = defineTool({
  name: "list_meetings",
  description: "Les rendez-vous de l'agenda que la personne voit, à partir d'un jour (aujourd'hui par défaut) et sur quelques jours (7 par défaut, 31 au plus).",
  permission: "meeting:read",
  approval: "auto",
  costClass: "free",
  input: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-JJ"), days: z.number().int().min(1).max(31).optional() }),
  execute: async (ctx, input) => {
    const from = input.from ?? dayBounds().today
    const to = addDays(from, input.days ?? 7)
    const rows = await listMeetings(personOf(ctx), { from: `${from}T00:00:00Z`, to: `${to}T00:00:00Z` })
    return {
      from,
      to,
      meetings: rows.slice(0, 30).map((m) => ({ leadId: m.leadId, name: m.leadName, contact: m.contactName, startsAt: m.startsAt, type: MEETING_TYPE_LABELS[m.type], status: meetingStatus[m.status].label, host: m.hostName, needsOutcome: m.needsOutcome })),
      total: rows.length,
    }
  },
})

export const getPipelineTool = defineTool({
  name: "get_pipeline",
  description: "Le pipeline que la personne voit : nombre et montant des opportunités par étape, et les opportunités ouvertes les plus récentes. « mine » pour les siennes.",
  permission: "deal:read",
  approval: "auto",
  costClass: "free",
  input: z.object({ mine: z.boolean().optional() }),
  execute: async (ctx, input) => {
    const deals = await listBoard(personOf(ctx), input.mine ? { owner: "me" } : {})
    const stages = Object.keys(dealStage) as (keyof typeof dealStage)[]
    const open = deals.filter((d) => (OPEN_STAGES as readonly string[]).includes(d.stage))
    return {
      byStage: stages.map((s) => {
        const of = deals.filter((d) => d.stage === s)
        return { stage: dealStage[s].label, count: of.length, amountEur: Math.round(of.reduce((sum, d) => sum + (d.amountCents ?? 0), 0) / 100) }
      }),
      note: "Gagnées et perdues : les 30 derniers jours seulement.",
      open: open.slice(0, 12).map((d) => ({ leadId: d.leadId, name: d.name, stage: dealStage[d.stage].label, amountEur: euros(d.amountCents), expectedClose: iso(d.expectedCloseAt), owner: d.ownerName, nextMeeting: iso(d.nextMeetingAt) })),
    }
  },
})

const cohort = (s: { leads: number; contacted: number; replied: number; qualified: number; meetings: number; won: number; replyRate: number | null; conversion: number | null }) => ({
  leads: s.leads,
  contacted: s.contacted,
  replied: s.replied,
  qualified: s.qualified,
  meetings: s.meetings,
  won: s.won,
  replyRate: s.replyRate,
  conversion: s.conversion,
})

export const listCampaignsTool = defineTool({
  name: "list_campaigns",
  description: "Les campagnes en cours et leurs résultats sur les fiches que la personne voit (fiches, contactées, réponses, qualifiées, rendez-vous, gagnées).",
  permission: "campaign:read",
  approval: "auto",
  costClass: "free",
  input: z.object({}),
  execute: async (ctx) => {
    const rows = await listCampaigns(personOf(ctx))
    return { campaigns: rows.slice(0, 20).map((c) => ({ campaignId: c.id, name: c.name, status: campaignStatus[c.status].label, sector: c.sector, area: c.area, goals: { leads: c.goalLeads, meetings: c.goalMeetings }, results: cohort(c.stats) })) }
  },
})

export const getCampaignTool = defineTool({
  name: "get_campaign",
  description: "Lit une campagne : objectifs, résultats, activité des 30 derniers jours, recherches et séquences liées.",
  permission: "campaign:read",
  approval: "auto",
  costClass: "free",
  input: z.object({ campaignId: z.string().min(1).max(64) }),
  execute: async (ctx, input) => {
    const c = await getCampaign(personOf(ctx), input.campaignId)
    return {
      campaignId: c.id,
      name: c.name,
      status: campaignStatus[c.status].label,
      description: clip(c.description, 400),
      sector: c.sector,
      area: c.area,
      period: { from: iso(c.startsOn), to: iso(c.endsOn) },
      goals: { leads: c.goalLeads, meetings: c.goalMeetings },
      results: cohort(c.stats),
      last30Days: c.recent,
      searches: c.searches.slice(0, 5).map((s) => ({ label: s.label, status: s.status, imported: s.importedCount })),
      sequences: c.sequences.slice(0, 5).map((s) => ({ name: s.name, active: s.active, total: s.total })),
    }
  },
})

// ---------------------------------------------------------------------------------------------------------------
// Actions: each one waits for the person's click in the conversation.
// ---------------------------------------------------------------------------------------------------------------

export const createTaskTool = defineTool({
  name: "create_task",
  description: "Propose une tâche sur une fiche (rappeler, relancer, envoyer un devis…), pour la personne elle-même, avec un jour d'échéance si elle en donne un. Elle valide avant la création.",
  permission: "task:write",
  approval: "user",
  costClass: "free",
  input: z.object({ leadId, title: z.string().trim().min(1).max(200), dueDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-JJ") }),
  summarize: async (input, ctx) => {
    const name = await visibleName(personOf(ctx), input.leadId)
    return `Créer la tâche « ${input.title} » sur la fiche ${name}${input.dueDay ? `, pour le ${formatDay(input.dueDay)}` : ", sans échéance"}.`
  },
  execute: async (ctx, input) => {
    const { id } = await createTask(personOf(ctx), input.leadId, { title: input.title, dueDay: input.dueDay ?? null })
    return { done: true, taskId: id, leadId: input.leadId }
  },
})

export const addNoteTool = defineTool({
  name: "add_note",
  description: "Propose d'ajouter une note à l'historique d'une fiche (compte rendu, information à retenir). Elle valide le texte exact avant l'ajout.",
  permission: "lead:write",
  approval: "user",
  costClass: "free",
  input: z.object({ leadId, text: z.string().trim().min(1).max(2_000) }),
  summarize: async (input, ctx) => `Ajouter à la fiche ${await visibleName(personOf(ctx), input.leadId)} la note : « ${clip(input.text, 300)} ».`,
  execute: async (ctx, input) => {
    await addActivity(personOf(ctx), input.leadId, { kind: "NOTE", body: input.text })
    return { done: true, leadId: input.leadId }
  },
})

const runCard = (agentId: AgentId, lead: string, runId: string, extra: Record<string, string> = {}) => ({ started: true, agentId, runId, leadId: lead, ...extra, note: "Le travail continue dans le worker ; la carte se met à jour en direct. Ne le présente pas comme terminé." })

export const startAuditTool = defineTool({
  name: "start_audit",
  description: "Confie à l'Auditeur un audit IA du site et de la présence en ligne de la fiche (une à trois minutes, dans le worker). Lis d'abord get_lead_audit : un audit de moins de 30 jours se relit, il ne se refait que si la personne le demande (force).",
  permission: "ai:use",
  approval: "user",
  costClass: "metered",
  input: z.object({ leadId, force: z.boolean().optional().describe("Refaire l'audit même s'il en existe un récent") }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    const name = await visibleName(user, input.leadId)
    if (!input.force) {
      const lead = await prisma.lead.findFirst({ where: { id: input.leadId, workspaceId: user.workspaceId }, select: { id: true, company: { select: { domain: true, website: true } } } })
      const fresh = lead && (await latestFor(user.workspaceId, lead))
      if (fresh && fresh.validUntil > new Date()) throw new LeadError("conflict", `Un audit du ${iso(fresh.createdAt.toISOString())} couvre déjà cette fiche : lis-le avec get_lead_audit, ou demande à la personne s'il faut le refaire (force).`, 409)
    }
    return `${input.force ? "Refaire" : "Lancer"} l'audit IA de ${name} (une à trois minutes, ${await capOf(user, "auditor")} au plus).`
  },
  execute: async (ctx, input) => {
    const result = await requestAudit(personOf(ctx), input.leadId, { force: input.force })
    return result.reused ? { started: false, reused: true, leadId: input.leadId, note: "Un audit récent existait déjà : lis-le avec get_lead_audit." } : runCard("auditor", input.leadId, result.runId)
  },
})

export const suggestOffersTool = defineTool({
  name: "suggest_offers",
  description: "Confie au Conseiller offres le choix des offres du catalogue pour la fiche, à partir de son audit (une minute environ, dans le worker) : offres classées, script d'appel, objections, angle d'email.",
  permission: "ai:use",
  approval: "user",
  costClass: "metered",
  input: z.object({ leadId }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    return `Demander au Conseiller les offres à proposer à ${await visibleName(user, input.leadId)} (${await capOf(user, "offers")} au plus).`
  },
  execute: async (ctx, input) => runCard("offers", input.leadId, (await requestPitch(personOf(ctx), input.leadId)).runId),
})

export const draftEmailTool = defineTool({
  name: "draft_email",
  description: "Confie au Rédacteur un premier email pour la fiche, tiré de son audit (quelques secondes, dans le worker). Le brouillon s'ouvre ensuite dans la fenêtre d'email de la fiche : la personne le relit, choisit sa boîte et l'envoie elle-même.",
  permission: "email:send",
  approval: "user",
  costClass: "metered",
  input: z.object({ leadId }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    return `Demander au Rédacteur un premier email pour ${await visibleName(user, input.leadId)}, à relire avant tout envoi (${await capOf(user, "writer")} au plus).`
  },
  execute: async (ctx, input) => {
    const { runId } = await requestFirstDraft(personOf(ctx), input.leadId)
    return runCard("writer", input.leadId, runId, { open: `/app/leads/${input.leadId}?brouillon=${runId}` })
  },
})

export const startStudioTool = defineTool({
  name: "start_studio",
  description: "Confie au Designer une landing de démonstration pour la fiche, construite à partir de son site (Studio Web) : il écrit d'abord un brief à relire, puis la page est générée depuis le Studio.",
  permission: "studio:generate",
  approval: "user",
  costClass: "metered",
  input: z.object({ leadId }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    return `Ouvrir une maquette du Studio Web pour ${await visibleName(user, input.leadId)} : le Designer écrit d'abord le brief (${await capOf(user, "designer")} au plus par étape).`
  },
  execute: async (ctx, input) => {
    const { siteId, runId } = await startStudio(personOf(ctx), input.leadId)
    return runCard("designer", input.leadId, runId, { open: `/app/studio/${siteId}` })
  },
})

/** Every tool of the copilot, reading first. */
export const COPILOT_TOOLS: readonly AnyToolDef[] = [
  searchLeadsTool,
  getLeadTool,
  getLeadAuditTool,
  getLeadOffersTool,
  getTodayTool,
  listMeetingsTool,
  getPipelineTool,
  listCampaignsTool,
  getCampaignTool,
  readSkillTool,
  createTaskTool,
  addNoteTool,
  startAuditTool,
  suggestOffersTool,
  draftEmailTool,
  startStudioTool,
]

/** The tools the person's role allows: the copilot is never offered what it could not do for them. */
export const toolsFor = (user: Pick<CurrentUser, "role">, opts: { skills: boolean }): AnyToolDef[] =>
  COPILOT_TOOLS.filter((t) => (t.name === readSkillTool.name ? opts.skills : !t.permission || can(user.role, t.permission)))
