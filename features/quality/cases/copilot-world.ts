import type { CurrentUser } from "@/lib/auth/guard"
import { can, scopeOf, type Permission } from "@/lib/rbac"
import { ROLE_LABELS } from "@/lib/crm/roles"
import { campaignStatus, dealStage, leadStatus, meetingStatus } from "@/lib/crm/status"
import { eurToMicros } from "@/lib/ai/budget"
import { untrusted } from "@/lib/ai/untrusted"
import { LeadError } from "@/features/leads/errors"
import { CALL_OUTCOMES, type CallOutcome } from "@/features/activity/rules"
import { MEETING_TYPE_LABELS, OUTCOME_LABELS } from "@/features/meetings/rules"
import { AREA_LABELS } from "@/features/prospect-audit/labels"
import { AREAS } from "@/features/prospect-audit/schemas"
import { formatOfferPrice, withPriceNote } from "@/features/offers/labels"
import { signalLabel } from "@/features/offers/signals"
import { AGENTS, type AgentId } from "@/features/ai/agents"
import { PAGE_RIGHTS } from "@/features/ai/actions/navigation"
import { effectivePolicy } from "@/features/ai/actions/policy"
import { clip, eur, formatMoment, plural } from "@/features/ai/actions/shared"
import { readSkillForAgent } from "@/features/ai/skills/service"
import type { AnyToolDef, ToolContext } from "@/features/ai/tools"
import { checkPlan, typicalCost, type PlanCheck, type PlanWorld } from "@/features/missions/plan"
import { describeRecurrence } from "@/features/missions/recurrence"
import {
  BASE,
  CAMPAIGNS,
  DEALS,
  LEADS,
  MAILBOXES,
  MEETINGS,
  METRICS,
  MISSIONS,
  REPLIES,
  SEARCHES,
  SECTORS,
  SEQUENCES,
  TASKS,
  TEAM,
  TODAY,
  COPILOT_NOW,
  type CampaignKey,
  type EvalLead,
  type MemberKey,
} from "@/evals/copilot"
import { FROZEN_OFFERS } from "./offers"

/**
 * The frozen CRM the copilot works in during an evaluation (E28 lot 3): every action of the catalogue keeps its
 * definition (what the model reads), but reads answer from evals/copilot.ts, as the person of the scenario would see
 * them, and writes are never done. An action without a click returns what the CRM would answer; an action that waits
 * for a click only writes its card, as in service, and the turn stops there. A mission's plan goes through the real
 * checks (features/missions/plan.ts), with this world's names and the code's caps.
 */
type In = Record<string, unknown>

interface Sim {
  /** What an action without a click returns. */
  run?: (w: CopilotWorld, input: In, ctx: ToolContext) => unknown
  /** The card of an action that waits for a click: what will happen, or why it cannot. */
  card?: (w: CopilotWorld, input: In) => string
}

const str = (v: unknown) => (typeof v === "string" ? v : "")
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const contains = (hay: string | null | undefined, needle: string) => !!hay && plain(hay).includes(plain(needle))
const notFound = (message: string) => new LeadError("not_found", message, 404)
const newId = (() => {
  let n = 0
  return (prefix: string) => `${prefix}_sim_${++n}`
})()

const NO_LEAD = "Fiche introuvable."
/** The CRM's 30 days of freshness for an audit. */
const AUDIT_DAYS = 30
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** Hours of the hosts who set theirs, in Paris (UTC+1 in November): 45-minute slots, Monday to Friday. */
const SLOT_HOURS = [9, 10, 11, 14, 15, 16]
const SLOT_MINUTES = 45

export class CopilotWorld {
  /** Plans the copilot proposed that passed the checks, in order. */
  readonly plans: PlanCheck[] = []

  constructor(
    readonly user: CurrentUser,
    readonly me: MemberKey
  ) {}

  /** The action as the copilot uses it here: its definition, this world's answers. */
  act = (def: AnyToolDef): AnyToolDef => {
    const sim = SIMS[def.name]
    if (!sim) return { ...def, execute: async () => Promise.reject(new LeadError("unavailable", `Action « ${def.name} » absente du CRM figé de l'évaluation.`, 503)) }
    return {
      ...def,
      execute: async (ctx: ToolContext, input: In) => {
        if (!sim.run) throw new Error(`« ${def.name} » attend un clic : elle ne s'exécute jamais dans une évaluation.`)
        return sim.run(this, input, ctx)
      },
      ...(def.summarize ? { summarize: async (input: In) => (sim.card ? sim.card(this, input) : `Utiliser « ${def.name} ».`) } : {}),
    }
  }

  // ── What the person sees ──

  private sees(owner: MemberKey | null, permission: Permission): boolean {
    switch (scopeOf(this.user.role, permission)) {
      case "all":
        return true
      case "own":
        return owner === this.me
      case "pool":
        return owner === null || owner === this.me
      default:
        return false
    }
  }

  can = (permission: Permission) => can(this.user.role, permission)
  memberName = (key: MemberKey | null) => (key ? TEAM[key].name : null)
  visibleLeads = () => LEADS.filter((l) => this.sees(l.owner, "lead:read"))

  lead(id: string): EvalLead {
    const l = LEADS.find((x) => x.id === id)
    if (!l || !this.sees(l.owner, "lead:read")) throw notFound(NO_LEAD)
    return l
  }

  mayWrite = (l: EvalLead) => this.sees(l.owner, "lead:write")

  /** A fiche the person may change. */
  writable(id: string): EvalLead {
    const l = this.lead(id)
    if (!this.sees(l.owner, "lead:write")) throw new LeadError("forbidden", "Vous ne pouvez pas modifier cette fiche.", 403)
    return l
  }

  /** As targetsOf: the fiches a grouped action would change, in words. */
  targets(ids: readonly string[]): { writable: EvalLead[]; text: string } {
    const unique = [...new Set(ids)]
    const rows = LEADS.filter((l) => unique.includes(l.id) && this.sees(l.owner, "lead:write"))
    if (!rows.length) throw notFound("Aucune de ces fiches ne peut être modifiée par cette personne : vérifie les leadId avec search_leads.")
    const names = rows.slice(0, 3).map((l) => l.name)
    const more = rows.length - names.length
    const out = unique.length - rows.length
    const text = `${plural(rows.length, "fiche", "fiches")} (${names.join(", ")}${more > 0 ? ` et ${plural(more, "autre", "autres")}` : ""})${out > 0 ? ` ; ${plural(out, "fiche est ignorée", "fiches sont ignorées")}, faute de droit` : ""}`
    return { writable: rows, text }
  }

  campaign(id: string) {
    const entry = Object.entries(CAMPAIGNS).find(([, c]) => c.id === id)
    if (!entry) throw notFound("Campagne introuvable : retrouve son campaignId avec list_campaigns.")
    return { key: entry[0] as CampaignKey, ...entry[1] }
  }

  member(id: string) {
    const entry = Object.entries(TEAM).find(([, m]) => m.id === id)
    if (!entry) throw notFound("Membre introuvable : retrouve son userId avec list_team.")
    return { key: entry[0] as MemberKey, ...entry[1] }
  }

  sequence(id: string) {
    const s = Object.values(SEQUENCES).find((x) => x.id === id)
    if (!s) throw notFound("Séquence introuvable : retrouve son sequenceId avec list_sequences.")
    return s
  }

  search(id: string) {
    const s = SEARCHES.find((x) => x.id === id)
    if (!s) throw notFound("Recherche introuvable : retrouve son searchId avec list_searches.")
    return s
  }

  task(id: string) {
    const t = TASKS.find((x) => x.id === id)
    if (!t) throw notFound("Tâche introuvable : retrouve son taskId avec get_lead ou get_today.")
    return { ...t, leadName: this.lead(LEADS.find((l) => l.key === t.lead)!.id).name, leadId: LEADS.find((l) => l.key === t.lead)!.id }
  }

  meeting(id: string) {
    const m = MEETINGS.find((x) => x.id === id)
    if (!m || !this.sees(m.host, "meeting:read")) throw notFound("Rendez-vous introuvable : retrouve son meetingId avec list_meetings.")
    const lead = LEADS.find((l) => l.key === m.lead)!
    return { ...m, name: this.lead(lead.id).name, leadId: lead.id }
  }

  leadOf = (key: string) => LEADS.find((l) => l.key === key)!
  visibleDeals = () => DEALS.filter((d) => this.sees(d.owner, "deal:read") && this.sees(this.leadOf(d.lead).owner, "lead:read"))
  visibleMeetings = () => MEETINGS.filter((m) => this.sees(m.host, "meeting:read") && this.sees(this.leadOf(m.lead).owner, "lead:read"))
  visibleReplies = () => REPLIES.filter((r) => (this.user.role === "OWNER" || this.user.role === "MANAGER" ? true : r.sentBy === this.me))

  /** The checks of a mission's plan, against this world. */
  planWorld = (): PlanWorld => ({
    name: async (kind, id) => {
      const safe = <T>(f: () => T) => {
        try {
          return f()
        } catch {
          return null
        }
      }
      switch (kind) {
        case "campaign":
          return safe(() => this.campaign(id).name)
        case "sequence":
          return safe(() => this.sequence(id).name)
        case "member":
          return safe(() => this.member(id).name)
        case "lead":
          return safe(() => this.lead(id).name)
        case "search":
          return safe(() => this.search(id).label)
        case "target":
          return null
        case "offer":
          return FROZEN_OFFERS.find((o) => o.slug === id)?.name ?? null
      }
    },
    leads: async (ids) => this.targets(ids).text,
    unsorted: async (campaignId) => this.visibleLeads().filter((l) => l.campaign && CAMPAIGNS[l.campaign].id === campaignId && !l.relevance).length,
    cost: async (agentId: AgentId) => ({ cap: eurToMicros(AGENTS[agentId].limits.maxCostEur), typical: typicalCost(agentId) }),
  })
}

// ── Reading ──────────────────────────────────────────────────────────────────────────────────────────────────────

const statusLabel = (s: string) => leadStatus[s as keyof typeof leadStatus]?.label ?? s
const byOf = (by: string) => (by in TEAM ? TEAM[by as MemberKey].name : by)
const activity = (a: EvalLead["history"][number]) => ({
  at: a.at,
  kind: a.kind,
  by: byOf(a.by),
  text: a.kind === "EMAIL" ? untrusted(a.text, { source: "email de la fiche", maxChars: 300 }) : clip(a.text, 300),
})

const leadRow = (w: CopilotWorld, l: EvalLead) => ({
  leadId: l.id,
  name: l.name,
  city: l.city,
  sector: l.sector,
  status: statusLabel(l.status),
  score: l.score,
  owner: w.memberName(l.owner),
  contact: l.contact?.name ?? null,
  lastContact: l.lastContact,
})

const RELEVANCE: Record<string, EvalLead["relevance"] | "unsorted"> = { relevant: "RELEVANT", maybe: "MAYBE", not: "NOT_RELEVANT", pending: "PENDING", unsorted: "unsorted" }

function cohort(rows: EvalLead[]) {
  const keys = new Set(rows.map((l) => l.key))
  const contacted = rows.filter((l) => l.status !== "NEW").length
  const replied = rows.filter((l) => l.status === "REPLIED" || l.status === "QUALIFIED" || REPLIES.some((r) => r.lead === l.key)).length
  const won = DEALS.filter((d) => keys.has(d.lead) && d.stage === "WON").length
  return {
    leads: rows.length,
    contacted,
    replied,
    qualified: rows.filter((l) => l.status === "QUALIFIED").length,
    meetings: MEETINGS.filter((m) => keys.has(m.lead)).length,
    won,
    replyRate: contacted ? Math.round((replied / contacted) * 100) / 100 : null,
    conversion: rows.length ? Math.round((won / rows.length) * 100) / 100 : null,
  }
}

const inCampaign = (w: CopilotWorld, key: CampaignKey) => w.visibleLeads().filter((l) => l.campaign === key)

/** A day's tasks, meetings and suggestions, as getToday gives them. */
function today(w: CopilotWorld, scope: "mine" | "team") {
  const team = scope === "team" && (w.user.role === "OWNER" || w.user.role === "MANAGER")
  const tasks = TASKS.filter((t) => (team ? true : t.assignee === w.me)).filter((t) => w.visibleLeads().some((l) => l.key === t.lead))
  const row = (t: (typeof TASKS)[number]) => {
    const l = w.leadOf(t.lead)
    return { taskId: t.id, leadId: l.id, name: l.name, task: t.title, due: t.due, assignee: TEAM[t.assignee].name }
  }
  const meetings = w.visibleMeetings().filter((m) => team || m.host === w.me)
  const unread = w.visibleReplies().filter((r) => !r.read && (team || w.leadOf(r.lead).owner === w.me))
  return {
    day: TODAY,
    scope: team ? "team" : "mine",
    overdue: tasks.filter((t) => t.due && t.due < TODAY).map(row),
    dueToday: tasks.filter((t) => t.due === TODAY).map(row),
    upcoming: tasks.filter((t) => t.due && t.due > TODAY && daysBetween(TODAY, t.due) <= 7).map(row),
    meetings: meetings.filter((m) => m.startsAt.slice(0, 10) === TODAY).map((m) => ({ meetingId: m.id, leadId: w.leadOf(m.lead).id, name: w.leadOf(m.lead).name, startsAt: m.startsAt, host: TEAM[m.host].name })),
    meetingsToClose: meetings.filter((m) => m.needsOutcome).map((m) => ({ meetingId: m.id, leadId: w.leadOf(m.lead).id, name: w.leadOf(m.lead).name, startsAt: m.startsAt })),
    suggestions: unread.map((r) => ({ leadId: w.leadOf(r.lead).id, name: w.leadOf(r.lead).name, why: `A répondu : « ${clip(r.subject, 80)} »` })),
    counts: {
      overdue: tasks.filter((t) => t.due && t.due < TODAY).length,
      dueToday: tasks.filter((t) => t.due === TODAY).length,
      upcoming: tasks.filter((t) => t.due && t.due > TODAY).length,
      undated: tasks.filter((t) => !t.due).length,
    },
  }
}

/** Free slots of a host who set hours: the next working days, outside its meetings, after now. */
function slotsOf(host: MemberKey, from: string, days: number): string[] {
  const busy = MEETINGS.filter((m) => m.host === host).map((m) => Date.parse(m.startsAt))
  const out: string[] = []
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i)
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    for (const hour of SLOT_HOURS) {
      const at = Date.parse(`${day}T${String(hour - 1).padStart(2, "0")}:00:00.000Z`)
      if (at <= Date.parse(COPILOT_NOW) || busy.some((b) => Math.abs(b - at) < SLOT_MINUTES * 60_000)) continue
      out.push(new Date(at).toISOString())
    }
  }
  return out
}

const offerName = (slug: string) => FROZEN_OFFERS.find((o) => o.slug === slug)?.name ?? slug

const SIMS: Record<string, Sim> = {
  search_leads: {
    run: (w, i) => {
      const status = strs(i.status)
      let rows = w.visibleLeads().filter((l) => {
        if (i.query && ![l.name, l.city, l.website, l.contact?.name, ...l.tags].some((x) => contains(x, str(i.query)))) return false
        if (status.length && !status.includes(l.status)) return false
        if (i.city && !contains(l.city, str(i.city))) return false
        if (i.sector && !contains(l.sector, str(i.sector))) return false
        if (i.campaignId) {
          if (i.campaignId === "none" ? l.campaign !== null : !l.campaign || CAMPAIGNS[l.campaign].id !== i.campaignId) return false
          const wanted = i.relevance ? RELEVANCE[str(i.relevance)] : null
          if (wanted && (wanted === "unsorted" ? !!l.relevance : l.relevance !== wanted)) return false
        }
        if (i.tag && !l.tags.includes(str(i.tag).toLowerCase())) return false
        if (i.hasEmail && !l.contact?.email) return false
        if (i.mine && l.owner !== w.me) return false
        if (typeof i.minScore === "number" && l.score < i.minScore) return false
        return true
      })
      const sort = str(i.sort) || "score"
      rows = [...rows].sort((a, b) =>
        sort === "name" ? a.name.localeCompare(b.name, "fr") : sort === "created" ? b.createdAt.localeCompare(a.createdAt) : sort === "contacted" ? (b.lastContact ?? "").localeCompare(a.lastContact ?? "") : sort === "status" ? a.status.localeCompare(b.status) : b.score - a.score
      )
      return { total: rows.length, leads: rows.slice(0, typeof i.limit === "number" ? i.limit : 10).map((l) => leadRow(w, l)) }
    },
  },
  get_lead: {
    run: (w, i) => {
      const l = w.lead(str(i.leadId))
      const write = w.mayWrite(l)
      return {
        leadId: l.id,
        name: l.name,
        status: statusLabel(l.status),
        score: l.score,
        scoreReasons: l.scoreReasons.slice(0, 8),
        owner: w.memberName(l.owner),
        campaign: l.campaign ? CAMPAIGNS[l.campaign].name : null,
        tags: l.tags,
        lastContact: l.lastContact,
        company: { city: l.city, sector: l.sector, website: l.website, phone: l.phone, googleRating: l.rating, googleReviews: l.reviews },
        contact: l.contact && { name: l.contact.name, jobTitle: l.contact.jobTitle, hasEmail: l.contact.email, hasPhone: l.contact.phone, doNotContact: !!l.contact.doNotContact },
        deals: w.visibleDeals().filter((d) => d.lead === l.key).map((d) => ({ dealId: d.id, stage: dealStage[d.stage].label, amountEur: d.amountEur, expectedClose: d.expectedClose, owner: TEAM[d.owner].name })),
        meetings: w.visibleMeetings().filter((m) => m.lead === l.key).map((m) => ({ meetingId: m.id, startsAt: m.startsAt, type: MEETING_TYPE_LABELS[m.type], status: meetingStatus[m.status].label, host: TEAM[m.host].name })),
        openTasks: TASKS.filter((t) => t.lead === l.key).map((t) => ({ taskId: t.id, title: t.title, due: t.due, assignee: TEAM[t.assignee].name })),
        history: l.history.slice(0, 8).map(activity),
        ai: {
          audit: l.audit ? `Audit du ${l.audit.date} : ${l.audit.score}/100, ${l.audit.potential.toLowerCase()}` : null,
          offers: l.pitch ? `${l.pitch.offers.length} offre(s) suggérée(s) le ${l.pitch.date}` : null,
          mockup: null,
        },
        canDo: { write, email: write && w.can("email:send"), audit: write && w.can("ai:use"), offers: write && w.can("ai:use"), studio: write && w.can("studio:generate") },
      }
    },
  },
  get_timeline: {
    run: (w, i) => ({ hasMore: false, items: w.lead(str(i.leadId)).history.slice(0, typeof i.limit === "number" ? i.limit : 25).map(activity) }),
  },
  get_lead_audit: {
    run: (w, i) => {
      const l = w.lead(str(i.leadId))
      const a = l.audit
      if (!a) return { audit: null, note: "Aucun audit pour cette fiche." }
      const order = { high: 0, medium: 1, low: 2 }
      return {
        date: a.date,
        fresh: daysBetween(a.date, TODAY) <= AUDIT_DAYS,
        site: l.website,
        score: a.score,
        potential: a.potential,
        scores: Object.fromEntries(AREAS.map((k) => [AREA_LABELS[k], a.scores[k]])),
        summary: a.summary,
        findings: [...a.findings].sort((x, y) => order[x.severity] - order[y.severity]).map((f) => ({ area: AREA_LABELS[f.area], severity: f.severity, title: f.title, detail: f.detail })),
        strengths: a.strengths,
        note: null,
      }
    },
  },
  get_lead_offers: {
    run: (w, i) => {
      const p = w.lead(str(i.leadId)).pitch
      if (!p) return { pitch: null, note: "Aucune offre suggérée pour l'instant." }
      return {
        date: p.date,
        headline: p.headline,
        offers: p.offers.map((r) => {
          const o = FROZEN_OFFERS.find((x) => x.slug === r.slug)!
          return { recommendationId: r.id, offer: o.name, price: withPriceNote(formatOfferPrice(o), o.priceNote), role: r.role, fit: r.role === "main" ? "high" : "medium", why: r.why, status: "SUGGESTED" }
        }),
        pack: null,
        emailAngle: null,
        stale: false,
      }
    },
  },
  get_today: { run: (w, i) => today(w, i.scope === "team" ? "team" : "mine") },
  list_meetings: {
    run: (w, i) => {
      const from = str(i.from) || TODAY
      const to = addDays(from, typeof i.days === "number" ? i.days : 7)
      const rows = w.visibleMeetings().filter((m) => m.startsAt.slice(0, 10) >= from && m.startsAt.slice(0, 10) < to)
      return {
        from,
        to,
        meetings: rows.map((m) => ({ meetingId: m.id, leadId: w.leadOf(m.lead).id, name: w.leadOf(m.lead).name, contact: w.leadOf(m.lead).contact?.name ?? null, startsAt: m.startsAt, type: MEETING_TYPE_LABELS[m.type], status: meetingStatus[m.status].label, host: TEAM[m.host].name, needsOutcome: m.needsOutcome })),
        total: rows.length,
      }
    },
  },
  list_slots: {
    run: (w, i) => {
      const bookable = (key: MemberKey) => scopeOf(w.user.role, "meeting:book") === "all" || key === w.me
      const hosts = (Object.keys(TEAM) as MemberKey[]).filter((k) => TEAM[k].role !== "VIEWER" && bookable(k))
      if (!i.hostId) return { hosts: hosts.map((k) => ({ hostId: TEAM[k].id, name: TEAM[k].name, hasHours: !!TEAM[k].hours })) }
      const host = w.member(str(i.hostId))
      if (!bookable(host.key)) throw new LeadError("forbidden", "Vous ne planifiez que vos propres rendez-vous.", 403)
      if (!host.hours) throw new LeadError("conflict", `${host.name} n'a pas encore réglé ses horaires de rendez-vous.`, 409)
      return { hostId: host.id, timezone: "Europe/Paris", durationMin: SLOT_MINUTES, slots: slotsOf(host.key, str(i.from) || TODAY, typeof i.days === "number" ? i.days : 7).slice(0, 40) }
    },
  },
  get_pipeline: {
    run: (w, i) => {
      const deals = w.visibleDeals().filter((d) => !i.mine || d.owner === w.me)
      const open = deals.filter((d) => d.stage !== "WON" && d.stage !== "LOST")
      return {
        byStage: (Object.keys(dealStage) as (keyof typeof dealStage)[]).map((s) => {
          const of = deals.filter((d) => d.stage === s)
          return { stage: dealStage[s].label, count: of.length, amountEur: of.reduce((sum, d) => sum + d.amountEur, 0) }
        }),
        note: "Gagnées et perdues : les 30 derniers jours seulement.",
        open: open.map((d) => ({ dealId: d.id, leadId: w.leadOf(d.lead).id, name: w.leadOf(d.lead).name, stage: dealStage[d.stage].label, amountEur: d.amountEur, expectedClose: d.expectedClose, owner: TEAM[d.owner].name, nextMeeting: MEETINGS.find((m) => m.lead === d.lead && m.startsAt > COPILOT_NOW)?.startsAt.slice(0, 10) ?? null })),
      }
    },
  },
  list_campaigns: {
    run: (w) => ({
      campaigns: (Object.keys(CAMPAIGNS) as CampaignKey[]).map((k) => {
        const c = CAMPAIGNS[k]
        return { campaignId: c.id, name: c.name, status: campaignStatus[c.status].label, sector: c.sector, area: c.area, goals: { leads: c.goalLeads, meetings: c.goalMeetings }, results: cohort(inCampaign(w, k)) }
      }),
    }),
  },
  get_campaign: {
    run: (w, i) => {
      const c = w.campaign(str(i.campaignId))
      const rows = inCampaign(w, c.key)
      const recent = rows.filter((l) => daysBetween(l.createdAt, TODAY) <= 30)
      return {
        campaignId: c.id,
        name: c.name,
        status: campaignStatus[c.status].label,
        description: c.description,
        sector: c.sector,
        area: c.area,
        period: { from: c.startsOn, to: null },
        goals: { leads: c.goalLeads, meetings: c.goalMeetings },
        results: cohort(rows),
        last30Days: { leads: recent.length, contacted: recent.filter((l) => l.lastContact && daysBetween(l.lastContact, TODAY) <= 30).length },
        searches: SEARCHES.filter((s) => s.campaign === c.key).map((s) => ({ label: s.label, status: s.status, imported: s.imported })),
        sequences: Object.entries(SEQUENCES)
          .filter(([k]) => k === c.key)
          .map(([, s]) => ({ name: s.name, active: s.status === "ACTIVE", total: s.active })),
      }
    },
  },
  get_campaign_sorting: {
    run: (w, i) => {
      const c = w.campaign(str(i.campaignId))
      const rows = inCampaign(w, c.key)
      const of = (v: EvalLead["relevance"]) => rows.filter((l) => l.relevance === v)
      return {
        offer: offerName(c.offer),
        counts: { relevant: of("RELEVANT").length, maybe: of("MAYBE").length, notRelevant: of("NOT_RELEVANT").length, toDecide: of("PENDING").length, unsorted: rows.filter((l) => !l.relevance).length },
        running: null,
        best: of("RELEVANT")
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map((l) => ({ leadId: l.id, name: l.name })),
        toDecide: of("PENDING").map((l) => ({ leadId: l.id, name: l.name })),
        canSort: w.can("campaign:manage"),
      }
    },
  },
  get_strategy: { run: () => ({ blocked: null, proposals: [], activeOffers: FROZEN_OFFERS.map((o) => ({ slug: o.slug, name: o.name })) }) },
  list_searches: {
    run: () => ({ searches: SEARCHES.map((s) => ({ searchId: s.id, label: s.label, status: s.status, found: s.found, useful: s.useful, imported: s.imported, campaign: s.campaign ? CAMPAIGNS[s.campaign].name : null, createdAt: s.createdAt })) }),
  },
  get_search: {
    run: (w, i) => {
      const s = w.search(str(i.searchId))
      return {
        searchId: s.id,
        label: s.label,
        status: s.status,
        error: null,
        counters: { found: s.found, complete: s.complete, useful: s.useful, withEmail: s.withEmail, tasks: "12/12" },
        spec: { activity: s.activity, location: s.location, maxResults: 1_000 },
        imported: s.imported,
        campaign: s.campaign ? { id: CAMPAIGNS[s.campaign].id, name: CAMPAIGNS[s.campaign].name } : null,
      }
    },
  },
  preview_import: {
    run: (w, i) => {
      const s = w.search(str(i.searchId))
      const reachable = i.hasEmail ? s.withEmail : s.useful
      const known = Math.min(s.imported + 12, reachable)
      return { wouldCreate: reachable - known, alreadyKnown: known, excluded: s.found - reachable, fetched: s.found, searchStatus: s.status }
    },
  },
  list_sequences: {
    run: () => ({ sequences: Object.values(SEQUENCES).map((s) => ({ sequenceId: s.id, name: s.name, status: s.status === "ACTIVE" ? "active" : "en pause", steps: s.steps, active: s.active, replied: s.replied, sent: s.sent })) }),
  },
  list_replies: {
    run: (w, i) => {
      const rows = [...w.visibleReplies()].sort((a, b) => b.at.localeCompare(a.at))
      return {
        unread: rows.filter((r) => !r.read).length,
        replies: rows.slice(0, typeof i.limit === "number" ? i.limit : 10).map((r) => ({
          replyId: r.id,
          leadId: w.leadOf(r.lead).id,
          name: w.leadOf(r.lead).name,
          subject: clip(r.subject, 120),
          excerpt: untrusted(r.body, { source: "réponse d'un prospect", maxChars: 300 }),
          class: r.class,
          read: r.read,
          at: r.at,
        })),
      }
    },
  },
  get_metrics: {
    run: (w, i) => {
      const days = typeof i.days === "number" ? i.days : 30
      const scale = (p: typeof METRICS.current) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Math.round((v * days) / 30)]))
      const sectors = new Map<string, number>()
      for (const l of w.visibleLeads()) sectors.set(l.sector, (sectors.get(l.sector) ?? 0) + 1)
      return {
        days,
        current: scale(METRICS.current),
        previous: scale(METRICS.previous),
        topSectors: [...sectors.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([sector, leads]) => ({ sector, leads })),
      }
    },
  },
  list_team: {
    run: (w) => {
      const all = (Object.keys(TEAM) as MemberKey[]).map((k) => TEAM[k])
      return {
        assignable: all.filter((m) => m.role !== "VIEWER").map((m) => ({ userId: m.id, name: m.name, role: ROLE_LABELS[m.role] })),
        members: w.can("team:read") ? all.map((m) => ({ userId: m.id, name: m.name, role: ROLE_LABELS[m.role], active: true })) : [],
      }
    },
  },
  list_sectors: {
    run: (_w, i) => {
      const q = str(i.query).trim()
      const rows = q ? SECTORS.filter((s) => [s.key, s.label, ...s.synonyms].some((x) => contains(x, q))) : SECTORS
      return { total: rows.length, sectors: rows.slice(0, 60).map((s) => ({ key: s.key, label: s.label, synonyms: s.synonyms.slice(0, 4) })) }
    },
  },
  search_prospect_base: {
    run: (_w, i) => {
      const rows = BASE.filter(
        (b) =>
          (!i.q || contains(b.name, str(i.q))) &&
          (!i.city || plain(b.city) === plain(str(i.city))) &&
          (!i.postalCode || b.postalCode.startsWith(str(i.postalCode))) &&
          (!i.category || contains(b.category, str(i.category))) &&
          (i.hasWebsite === undefined || !!b.website === i.hasWebsite) &&
          (!i.useful || b.email || b.phone)
      )
      const limit = typeof i.limit === "number" ? i.limit : 10
      return {
        more: rows.length > limit,
        businesses: rows.slice(0, limit).map((b) => ({
          name: untrusted(b.name, { source: "Extractor", maxChars: 120 }),
          category: b.category,
          city: b.city,
          postalCode: b.postalCode,
          website: b.website,
          rating: b.rating,
          reviews: b.reviews,
          hasEmail: b.email,
          hasPhone: b.phone,
          completeness: b.completeness,
        })),
      }
    },
  },
  extractor_health: { run: () => ({ state: "ok", lines: ["Google Maps : opérationnel", "Sites web : opérationnel", "Annuaire des entreprises : opérationnel"], blocked: [] }) },
  list_offers: {
    run: (_w, i) =>
      FROZEN_OFFERS.filter((o) => !i.category || o.category === i.category).map((o) => ({
        slug: o.slug,
        name: o.name,
        category: o.category,
        summary: o.summary,
        signals: o.signals.map((s) => ({ key: s, label: signalLabel(s) })),
        deliverables: o.deliverables,
        price: withPriceNote(formatOfferPrice(o), o.priceNote),
        angle: o.angle,
      })),
  },
  // The real skills of the workspace, the offers' one written from the frozen catalogue.
  read_skill: { run: (_w, i, ctx) => readSkillForAgent(ctx.run.workspaceId, "copilot", str(i.name), typeof i.file === "string" ? i.file : undefined, FROZEN_OFFERS) },
  list_missions: {
    run: (w) => ({
      missions: MISSIONS.filter((m) => w.user.role === "OWNER" || w.user.role === "MANAGER" || m.by === w.me).map((m) => ({ missionId: m.id, title: m.title, status: m.status, steps: m.steps, spentEur: m.spentEur })),
    }),
  },
  open_page: {
    run: (w, i) => {
      const page = str(i.page) as keyof typeof PAGE_RIGHTS
      const right = PAGE_RIGHTS[page]
      if (right && !w.can(right)) throw new LeadError("forbidden", "Cette page n'est pas ouverte à la personne.", 403)
      const id = str(i.id)
      const need = (what: string) => {
        if (!id) throw new LeadError("invalid", `Il faut l'identifiant ${what} (id).`, 400)
        return id
      }
      switch (page) {
        case "lead":
          return { open: `/app/leads/${need("de la fiche")}`, label: w.lead(id).name }
        case "campaign":
          return { open: `/app/campaigns/${need("de la campagne")}`, label: w.campaign(id).name }
        case "search":
          return { open: `/app/search/${need("de la recherche")}`, label: w.search(id).label }
        case "studio":
          need("de la maquette")
          throw notFound("Maquette introuvable.")
        case "leads": {
          const f = (i.filters ?? {}) as In
          const q = new URLSearchParams()
          if (f.query) q.set("q", str(f.query))
          if (strs(f.status).length) q.set("status", strs(f.status).join(","))
          if (f.city) q.set("city", str(f.city))
          if (f.sector) q.set("sector", str(f.sector))
          if (f.campaignId) q.set("campaign", str(f.campaignId))
          if (f.tag) q.set("tag", str(f.tag).toLowerCase())
          if (f.relevance) q.set("relevance", str(f.relevance))
          if (f.mine) q.set("owner", "me")
          if (f.sort) q.set("sort", str(f.sort))
          return { open: `/app/leads${q.size ? `?${q}` : ""}`, label: "Fiches" }
        }
        case "agents":
          return { open: `/app/agents${i.tab ? `?tab=${str(i.tab)}` : ""}`, label: "Agents IA" }
        case "hq":
          return { open: `/app/3d${i.zone ? `?zone=${str(i.zone)}` : ""}`, label: "QG 3D" }
        default: {
          const labels: Record<string, [string, string]> = {
            campaigns: ["/app/campaigns", "Campagnes"],
            pipeline: ["/app/pipeline", "Pipeline"],
            meetings: ["/app/meetings", "Agenda"],
            today: ["/app", "Aujourd'hui"],
            searches: ["/app/search", "Recherche"],
            mailbox: ["/app/mailbox", "Boîte de réception"],
            sequences: ["/app/sequences", "Séquences"],
          }
          const [open, label] = labels[page] ?? ["/app", "CRM"]
          return { open, label }
        }
      }
    },
  },

  // ── Notes, tasks, tags: done without a click ──
  add_note: {
    run: (w, i) => {
      const l = w.writable(str(i.leadId))
      return { done: true, leadId: l.id, name: l.name }
    },
  },
  log_call: {
    run: (w, i) => {
      const l = w.writable(str(i.leadId))
      return { done: true, leadId: l.id, name: l.name, outcome: CALL_OUTCOMES[str(i.outcome) as CallOutcome] }
    },
  },
  create_task: {
    run: (w, i) => {
      const l = w.writable(str(i.leadId))
      return { done: true, taskId: newId("task"), leadId: l.id, name: l.name }
    },
  },
  complete_task: {
    run: (w, i) => {
      const t = w.task(str(i.taskId))
      return { done: true, taskId: t.id, task: t.title, leadId: t.leadId }
    },
  },
  reschedule_task: {
    run: (w, i) => {
      const t = w.task(str(i.taskId))
      return { done: true, taskId: t.id, task: t.title, leadId: t.leadId, previousDueDay: t.due }
    },
  },
  tag_leads: { run: (w, i) => retag(w, i, "tag") },
  untag_leads: { run: (w, i) => retag(w, i, "untag") },

  // ── Missions ──
  propose_mission: {
    run: async (w, i) => {
      const check = await checkPlan(w.user, effectivePolicy(AGENTS.copilot, null), i, w.planWorld())
      w.plans.push(check)
      const cap = eurToMicros(2)
      const over = check.maxMicros > cap
      return {
        proposed: true,
        missionId: newId("mission"),
        title: check.plan.title,
        steps: check.plan.steps.map((s, n) => `${n + 1}. ${s.text}${s.level === "explicit" ? " (attendra son propre clic)" : ""}`),
        cost: `environ ${eur(check.probableMicros)}, ${eur(check.maxMicros)} au plus${over ? ` : au-delà du plafond de ${eur(cap)} par mission, la personne devra confirmer une seconde fois` : ""}`,
        ...(check.plan.recurrence ? { recurrence: `${describeRecurrence(check.plan.recurrence)}, premier passage au lancement` } : {}),
        note: "Plan proposé, pas lancé : la personne le lance d'un clic sur sa carte. Ne le présente pas comme lancé ; dis en une ou deux phrases ce qu'il fera et ce qu'il peut coûter.",
      }
    },
  },
  manage_mission: {
    card: (w, i) => {
      const m = MISSIONS.find((x) => x.id === i.missionId)
      if (!m) throw notFound("Mission introuvable : retrouve son missionId avec list_missions.")
      const verbs: Record<string, string> = { pause: "Mettre en pause", resume: "Reprendre", cancel: "Annuler", stop_recurrence: "Arrêter la récurrence de" }
      return `${verbs[str(i.action)] ?? "Modifier"} la mission « ${m.title} ».`
    },
  },

  // ── Changes that wait for a click: their card only ──
  create_lead: { card: (_w, i) => `Créer la fiche ${str((i.company as In | undefined)?.name)}.` },
  update_lead: { card: (w, i) => `Modifier la fiche ${w.writable(str(i.leadId)).name}.` },
  set_lead_status: {
    card: (w, i) => `Passer en « ${statusLabel(str(i.status))} » ${w.targets(strs(i.leadIds)).text}${i.status === "DO_NOT_CONTACT" ? " ; leurs séquences s'arrêtent" : ""}.`,
  },
  assign_leads: { card: (w, i) => `Attribuer ${i.ownerId ? `à ${w.member(str(i.ownerId)).name}` : "au pool commun"} ${w.targets(strs(i.leadIds)).text}.` },
  file_in_campaign: { card: (w, i) => `Ranger ${i.campaignId ? `dans la campagne « ${w.campaign(str(i.campaignId)).name} »` : "hors campagne"} ${w.targets(strs(i.leadIds)).text}.` },
  qualify_lead: {
    card: (w, i) => {
      const name = w.writable(str(i.leadId)).name
      if (i.decision === "disqualify" && !i.reason) throw new LeadError("invalid", "Une disqualification demande une raison (reason).", 400)
      return i.decision === "qualify" ? `Qualifier ${name} et ouvrir son opportunité.` : `Disqualifier ${name} : ${str(i.reason)}.`
    },
  },
  move_deal: {
    card: (w, i) => {
      const d = w.visibleDeals().find((x) => x.id === i.dealId)
      if (!d) throw notFound("Opportunité introuvable : retrouve son dealId avec get_lead.")
      if (i.stage === undefined && i.amountEur === undefined && i.expectedClose === undefined) throw new LeadError("invalid", "Aucun changement demandé.", 400)
      return `Opportunité de ${w.leadOf(d.lead).name} : ${i.stage ? `étape « ${dealStage[str(i.stage) as keyof typeof dealStage]?.label ?? str(i.stage)} »` : "mise à jour"}.`
    },
  },
  create_campaign: {
    card: (_w, i) => {
      if (i.offerSlug && !FROZEN_OFFERS.some((o) => o.slug === i.offerSlug)) throw notFound(`Offre « ${str(i.offerSlug)} » introuvable parmi les offres actives : lis-les avec list_offers.`)
      const bits = [str(i.sector), str(i.area), i.offerSlug ? `offre « ${offerName(str(i.offerSlug))} »` : "", typeof i.goalLeads === "number" ? `objectif ${plural(i.goalLeads, "fiche", "fiches")}` : ""].filter(Boolean)
      return `Créer la campagne « ${str(i.name)} »${bits.length ? ` (${bits.join(", ")})` : ""}${i.status === "ACTIVE" ? ", active" : ", en brouillon"}.`
    },
  },
  update_campaign: {
    card: (w, i) => {
      const c = w.campaign(str(i.campaignId))
      const changes = Object.entries(i).filter(([k, v]) => k !== "campaignId" && v !== undefined)
      if (!changes.length) throw new LeadError("invalid", "Aucun changement demandé.", 400)
      return `Modifier la campagne « ${c.name} » : ${changes.map(([k, v]) => `${k} → ${clip(String(v), 60)}`).join(", ")}.`
    },
  },
  start_search: {
    card: (w, i) => {
      const campaign = i.campaignId ? w.campaign(str(i.campaignId)) : null
      const n = typeof i.maxResults === "number" ? i.maxResults : 300
      return `Lancer la recherche Extractor « ${str(i.activity)} — ${str(i.location)} » : ${plural(n, "entreprise", "entreprises")} au plus${i.enrich === false ? ", sans les emails" : ", avec les emails (plus lent)"}${campaign ? `, pour la campagne « ${campaign.name} »` : ""}. Rien n'est importé avant l'étape d'import.`
    },
  },
  cancel_search: { card: (w, i) => `Arrêter la recherche « ${w.search(str(i.searchId)).label} ».` },
  import_search: {
    card: (w, i) => {
      const s = w.search(str(i.searchId))
      return `Importer les entreprises joignables${i.hasEmail ? " avec un email" : ""} de la recherche « ${s.label} » (${plural(s.useful, "joignable", "joignables")} à ce stade)${s.campaign ? `, dans la campagne « ${CAMPAIGNS[s.campaign].name} »` : ""}.`
    },
  },
  sort_campaign: { card: (w, i) => `Demander à Jev de trier les fiches de la campagne « ${w.campaign(str(i.campaignId)).name} » (${eur(eurToMicros(AGENTS.qualifier.limits.maxCostEur))} au plus par lot de 40 fiches).` },
  start_audit: {
    card: (w, i) => {
      const l = w.writable(str(i.leadId))
      if (!i.force && l.audit && daysBetween(l.audit.date, TODAY) <= AUDIT_DAYS) throw new LeadError("conflict", `Un audit du ${l.audit.date} couvre déjà cette fiche : lis-le avec get_lead_audit, ou demande à la personne s'il faut le refaire (force).`, 409)
      return `${i.force ? "Refaire" : "Lancer"} l'audit IA de ${l.name} (une à trois minutes, ${eur(eurToMicros(AGENTS.auditor.limits.maxCostEur))} au plus).`
    },
  },
  suggest_offers: { card: (w, i) => `Demander au Conseiller les offres à proposer à ${w.writable(str(i.leadId)).name} (${eur(eurToMicros(AGENTS.offers.limits.maxCostEur))} au plus).` },
  decide_offer: {
    card: (w, i) => {
      const l = w.writable(str(i.leadId))
      const rec = l.pitch?.offers.find((r) => r.id === i.recommendationId)
      if (!rec) throw notFound("Offre suggérée introuvable : retrouve son recommendationId avec get_lead_offers.")
      const verb = i.status === "ACCEPTED" ? "Retenir" : i.status === "REJECTED" ? "Écarter" : "Remettre en suggestion"
      return `${verb} l'offre « ${offerName(rec.slug)} » pour ${l.name}.`
    },
  },
  draft_email: { card: (w, i) => `Demander au Rédacteur un premier email pour ${w.lead(str(i.leadId)).name}, à relire avant tout envoi (${eur(eurToMicros(AGENTS.writer.limits.maxCostEur))} au plus).` },
  draft_reply: {
    card: (w, i) => {
      const r = REPLIES.find((x) => x.id === i.replyId)
      if (!r) throw notFound("Réponse introuvable : retrouve son replyId avec list_replies.")
      return `Demander au Rédacteur une réponse à ${w.lead(w.leadOf(r.lead).id).name} (« ${clip(r.subject, 80)} »), à relire avant tout envoi (${eur(eurToMicros(AGENTS.writer.limits.maxCostEur))} au plus).`
    },
  },
  start_studio: { card: (w, i) => `Ouvrir une maquette du Studio Web pour ${w.lead(str(i.leadId)).name} : le Designer écrit d'abord le brief (${eur(eurToMicros(AGENTS.designer.limits.maxCostEur))} au plus par étape).` },
  studio_build: { card: noSite },
  studio_revise: { card: noSite },
  share_studio_link: { card: noSite },
  propose_targets: { card: (_w, i) => `Demander au Stratège des cibles${i.zone ? ` à ${str(i.zone)}` : ""}${i.focus ? ` (${clip(str(i.focus), 120)})` : ""} (${eur(eurToMicros(AGENTS.strategist.limits.maxCostEur))} au plus).` },
  act_on_target: {
    card: () => {
      throw notFound("Cible introuvable : retrouve son targetId avec get_strategy.")
    },
  },
  enroll_in_sequence: {
    card: (w, i) => {
      const s = w.sequence(str(i.sequenceId))
      if (s.status !== "ACTIVE") throw new LeadError("conflict", "Cette séquence est en pause : il faut la reprendre avant d'y inscrire des fiches.", 409)
      const box = MAILBOXES[w.me]
      if (!box) throw new LeadError("conflict", "Aucune boîte d'envoi active pour cette personne : elle se règle dans Réglages › Emails.", 409)
      return `Inscrire dans la séquence « ${s.name} » (${plural(s.steps, "email", "emails")}) ${w.targets(strs(i.leadIds)).text}. Les emails partiront depuis ${box}, sans autre validation.`
    },
  },
  stop_enrollment: { card: (w, i) => `Arrêter la séquence en cours de ${w.writable(str(i.leadId)).name}.` },
  pause_sequence: { card: (w, i) => `Mettre en pause la séquence « ${w.sequence(str(i.sequenceId)).name} » : plus aucun email n'en part.` },
  resume_sequence: { card: (w, i) => `Reprendre la séquence « ${w.sequence(str(i.sequenceId)).name} » : ses envois reprennent vers les fiches inscrites.` },
  book_meeting: {
    card: (w, i) => {
      const name = w.lead(str(i.leadId)).name
      const host = w.member(str(i.hostId))
      const type = MEETING_TYPE_LABELS[(str(i.type) || "DISCOVERY") as keyof typeof MEETING_TYPE_LABELS] ?? "Découverte"
      return `Planifier un rendez-vous ${type.toLowerCase()} avec ${name}, ${formatMoment(str(i.startsAt))}, avec ${host.name}${i.notifyGuest === false ? " (sans invitation au prospect)" : " ; l'invitation part au prospect"}.`
    },
  },
  change_meeting: {
    card: (w, i) => {
      const m = w.meeting(str(i.meetingId))
      if (i.action === "reschedule" && !i.startsAt) throw new LeadError("invalid", "Un report demande la nouvelle heure (startsAt).", 400)
      const what = i.action === "confirm" ? "Confirmer" : i.action === "cancel" ? "Annuler" : `Reporter au ${formatMoment(str(i.startsAt))}`
      return `${what} le rendez-vous avec ${m.name} du ${formatMoment(m.startsAt)} ; le prospect en est prévenu.`
    },
  },
  record_meeting_outcome: {
    card: (w, i) => {
      const m = w.meeting(str(i.meetingId))
      const outcome = i.outcome === "NO_SHOW" ? "le prospect n'est pas venu" : OUTCOME_LABELS[str(i.outcome) as keyof typeof OUTCOME_LABELS]
      return `Clôturer le rendez-vous avec ${m.name} du ${formatMoment(m.startsAt)} : ${outcome}.`
    },
  },
}

function noSite(): string {
  throw notFound("Maquette introuvable : retrouve son siteId avec get_lead.")
}

function retag(w: CopilotWorld, i: In, type: "tag" | "untag") {
  const { writable } = w.targets(strs(i.leadIds))
  const tag = str(i.tag).trim().toLowerCase()
  const changing = writable.filter((l) => (type === "tag" ? !l.tags.includes(tag) : l.tags.includes(tag))).map((l) => l.id)
  return { done: true, tag, updated: changing.length, unchanged: writable.length - changing.length, notAllowed: strs(i.leadIds).length - writable.length, changedIds: changing }
}

/** The actions the frozen CRM answers (tests: every action of the catalogue, with a card for those that wait). */
export const SIMULATED: Readonly<Record<string, Sim>> = SIMS
