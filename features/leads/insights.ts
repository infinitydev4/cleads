import type { LeadStatus, Prisma, SignalKind } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { dayBounds } from "@/lib/crm/day"
import { formatOfferPrice } from "@/features/offers/labels"
import { domainOf, latestFor } from "@/features/prospect-audit/latest"
import { objectionSchema, scriptSchema } from "@/features/offer-pitch/schemas"
import type { FocusFilter } from "./schemas"
import type { CallBrief, Priority, RowInsight, SiteState } from "./types"

/**
 * The closer's desk (9 November 2026): what the list and the fiche show at a glance to prepare a phone sale. Everything
 * is computed when read, from data the CRM already holds (audit, suggested offers, tasks, registry signals); nothing is
 * stored, and the rules below are the only place they are decided.
 */

/** Below this audit score the site still has much to gain: the audit's « potentiel élevé » or « moyen ». */
export const WEAK_SITE_BELOW = 70
/** A fiche never contacted with at least this score is worth calling first. */
export const HOT_SCORE = 80
/** Under this score, and with nothing urgent, a fiche waits. */
export const COLD_SCORE = 40
/** A registry or advertising signal younger than this is a reason to call now. */
export const SIGNAL_DAYS = 30
/** Signals that open a conversation; a collective procedure or a closure blocks it instead (E30). */
export const CALL_SIGNALS = ["CREATED", "TAKEOVER", "NEW_LEADER", "MOVED", "NEW_SITE", "GEO_ABSENT", "ADS_RUNNING"] as const satisfies readonly SignalKind[]

const BLOCKED: LeadStatus[] = ["DISQUALIFIED", "DO_NOT_CONTACT"]

export function siteState(website: string | null | undefined, auditScore: number | null | undefined): SiteState {
  if (!website) return "none"
  if (auditScore == null) return "unknown"
  return auditScore < WEAK_SITE_BELOW ? "weak" : "ok"
}

/**
 * 1: call first (a callback due today or late, a reply, a recent signal, or a strong fiche never contacted).
 * 3: wait (no phone, a fiche out of the game, a weak score). 2: everything else.
 */
export function priorityOf(l: { status: LeadStatus; score: number; hasPhone: boolean; blocked: boolean; dueToday: boolean; recentSignal: boolean }): Priority {
  if (BLOCKED.includes(l.status) || l.blocked || !l.hasPhone) return 3
  if (l.dueToday || l.status === "REPLIED" || l.recentSignal || (l.status === "NEW" && l.score >= HOT_SCORE)) return 1
  return l.score < COLD_SCORE ? 3 : 2
}

const since = (now: Date) => new Date(now.getTime() - SIGNAL_DAYS * 86_400_000)

/** The segments of the call file, as a query: the same rules as priorityOf and siteState. */
export function focusWhere(focus: FocusFilter, now = new Date()): Prisma.LeadWhereInput {
  const due: Prisma.LeadWhereInput = { tasks: { some: { doneAt: null, dueAt: { lt: dayBounds(now).end } } } }
  switch (focus) {
    case "callback":
      return due
    case "nosite":
      return { OR: [{ companyId: null }, { company: { is: { website: null } } }] }
    case "fresh":
      return { status: "NEW", lastContactedAt: null }
    case "hot":
      return {
        AND: [
          { status: { notIn: BLOCKED } },
          { OR: [{ companyId: null }, { company: { is: { legalState: "ACTIVE" } } }] },
          { OR: [{ contact: { is: { phone: { not: null } } } }, { company: { is: { phone: { not: null } } } }] },
          {
            OR: [
              due,
              { status: "REPLIED" },
              { company: { is: { signals: { some: { dismissedAt: null, kind: { in: [...CALL_SIGNALS] }, occurredAt: { gte: since(now) } } } } } },
              { status: "NEW", score: { gte: HOT_SCORE } },
            ],
          },
        ],
      }
  }
}

export interface InsightSource {
  id: string
  status: LeadStatus
  score: number
  companyId: string | null
  company: { website: string | null; domain: string | null; phone: string | null; legalState: string | null } | null
  contact: { phone: string | null } | null
}

/** The glance of each fiche of a page of the list: four reads for the whole page, whatever its size. */
export async function rowInsights(workspaceId: string, leads: InsightSource[], now = new Date()): Promise<Map<string, RowInsight>> {
  const ids = leads.map((l) => l.id)
  const companyIds = leads.flatMap((l) => (l.companyId ? [l.companyId] : []))
  const domains = [...new Set(leads.flatMap((l) => domainOf(l.company) ?? []))]
  const { end } = dayBounds(now)
  const [audits, offers, tasks, signals] = ids.length
    ? await Promise.all([
        prisma.prospectAudit.findMany({
          where: { workspaceId, OR: [{ leadId: { in: ids } }, ...(domains.length ? [{ domain: { in: domains }, validUntil: { gt: now } }] : [])] },
          orderBy: { createdAt: "desc" },
          select: { leadId: true, domain: true, score: true, validUntil: true },
        }),
        prisma.offerRecommendation.findMany({
          where: { workspaceId, status: { not: "REJECTED" }, pitch: { leadId: { in: ids } } },
          orderBy: [{ pitch: { createdAt: "desc" } }, { rank: "asc" }],
          select: { offerName: true, priceMinEur: true, priceMaxEur: true, billing: true, pitch: { select: { leadId: true } } },
        }),
        prisma.task.findMany({ where: { leadId: { in: ids }, doneAt: null }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], select: { leadId: true, title: true, dueAt: true } }),
        companyIds.length
          ? prisma.companySignal.findMany({
              where: { companyId: { in: companyIds }, dismissedAt: null, kind: { in: [...CALL_SIGNALS] }, occurredAt: { gte: since(now) } },
              orderBy: { occurredAt: "desc" },
              select: { companyId: true, summary: true },
            })
          : Promise.resolve([]),
      ])
    : [[], [], [], []]

  const out = new Map<string, RowInsight>()
  for (const l of leads) {
    const domain = domainOf(l.company)
    const audit = audits.find((a) => a.leadId === l.id || (!!domain && a.domain === domain && a.validUntil > now))
    const offer = offers.find((o) => o.pitch.leadId === l.id)
    const task = tasks.find((t) => t.leadId === l.id)
    const signal = l.companyId ? signals.find((s) => s.companyId === l.companyId) : undefined
    const dueToday = !!task?.dueAt && task.dueAt < end
    out.set(l.id, {
      site: siteState(l.company?.website, audit?.score),
      offer: offer ? { name: offer.offerName, price: formatOfferPrice(offer) } : null,
      next: task ? { title: task.title, dueAt: task.dueAt?.toISOString() ?? null, late: !!task.dueAt && task.dueAt < now } : null,
      signal: signal?.summary ?? null,
      priority: priorityOf({
        status: l.status,
        score: l.score,
        hasPhone: !!(l.contact?.phone ?? l.company?.phone),
        blocked: !!l.company?.legalState && l.company.legalState !== "ACTIVE",
        dueToday,
        recentSignal: !!signal,
      }),
    })
  }
  return out
}

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })

/**
 * What the fiche puts first for a phone sale: why call now (a callback, the registry, the audit's three points for the
 * closer), and the latest call script with its offers and objections. Every reason names its source.
 */
export async function callBrief(
  workspaceId: string,
  lead: InsightSource & { tasks: { title: string; dueAt: Date | null }[] },
  /** What the person may read: the audit (ai:read) and the pitch (ai:use), as on the rest of the fiche. */
  may: { audit: boolean; pitch: boolean },
  now = new Date()
): Promise<CallBrief> {
  const [audit, pitch, signals] = await Promise.all([
    may.audit ? latestFor(workspaceId, { id: lead.id, company: lead.company }, now) : Promise.resolve(null),
    !may.pitch ? Promise.resolve(null) : prisma.offerPitch.findFirst({
      where: { workspaceId, leadId: lead.id },
      orderBy: { createdAt: "desc" },
      select: {
        headline: true,
        script: true,
        objections: true,
        createdAt: true,
        recommendations: { where: { status: { not: "REJECTED" } }, orderBy: { rank: "asc" }, take: 2, select: { offerName: true, priceMinEur: true, priceMaxEur: true, billing: true, why: true, gain: true } },
      },
    }),
    lead.companyId
      ? prisma.companySignal.findMany({
          where: { companyId: lead.companyId, dismissedAt: null, kind: { in: [...CALL_SIGNALS] }, occurredAt: { gte: since(now) } },
          orderBy: { occurredAt: "desc" },
          take: 2,
          select: { summary: true, source: true, sourceUrl: true },
        })
      : Promise.resolve([]),
  ])
  const { end } = dayBounds(now)
  const task = lead.tasks.find((t) => t.dueAt) ?? null
  const due = !!task?.dueAt && task.dueAt < end
  const reasons: CallBrief["reasons"] = []
  if (due && task?.dueAt) {
    const when = task.dueAt < now && dayBounds(task.dueAt).today !== dayBounds(now).today ? `en retard depuis le ${day.format(task.dueAt)}` : `prévu à ${time.format(task.dueAt)}`
    reasons.push({ text: `${task.title} : ${when}.`, source: "Tâche", url: null })
  }
  // A signal's source is already a label ("BODACC", "Bibliothèque publicitaire Meta").
  for (const s of signals) reasons.push({ text: s.summary, source: s.source, url: s.sourceUrl })
  for (const point of audit?.summary ?? []) reasons.push({ text: point, source: `Audit IA du ${day.format(audit!.createdAt)}`, url: null })

  const script = pitch ? scriptSchema.safeParse(pitch.script) : null
  const objections = pitch ? z.array(objectionSchema).safeParse(pitch.objections) : null
  return {
    priority: priorityOf({
      status: lead.status,
      score: lead.score,
      hasPhone: !!(lead.contact?.phone ?? lead.company?.phone),
      blocked: !!lead.company?.legalState && lead.company.legalState !== "ACTIVE",
      dueToday: due,
      recentSignal: signals.length > 0,
    }),
    site: siteState(lead.company?.website, audit?.score),
    siteScore: audit?.score ?? null,
    audited: !!audit,
    reasons: reasons.slice(0, 5),
    pitch: pitch && {
      headline: pitch.headline,
      createdAt: pitch.createdAt.toISOString(),
      script: script?.success ? script.data : null,
      objections: objections?.success ? objections.data : [],
      offers: pitch.recommendations.map((r) => ({ name: r.offerName, price: formatOfferPrice(r), why: r.why, gain: r.gain })),
    },
  }
}
