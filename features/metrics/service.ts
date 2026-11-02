import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { scopeWhere } from "@/features/leads/service"
import { rate } from "./definitions"

/**
 * The figures of features/metrics/definitions.ts, computed on what the person may see: every count goes through the
 * fiches visible to them (lead:read), so an SDR's numbers never include a colleague's fiches.
 */

export interface Period {
  from: Date
  to: Date
}

/** The last `days` days up to `now`, and the same length just before (for the trend). */
export function periodsOf(days: number, now = new Date()): { current: Period; previous: Period } {
  const ms = days * 86_400_000
  const to = now
  const from = new Date(to.getTime() - ms)
  return { current: { from, to }, previous: { from: new Date(from.getTime() - ms), to: from } }
}

const within = (p: Period) => ({ gte: p.from, lt: p.to })

/** Fiches the person may see, optionally narrowed (a campaign, a source...). */
export function visibleLeads(user: CurrentUser, extra: Prisma.LeadWhereInput = {}): Prisma.LeadWhereInput {
  return { AND: [{ workspaceId: user.workspaceId }, scopeWhere(user, "lead:read"), extra] }
}

/** An email that left a mailbox (accepted, possibly bounced afterwards); tests are never prospecting. */
const sentEmail = (p?: Period): Prisma.EmailMessageWhereInput => ({ direction: "OUTBOUND", status: { in: ["SENT", "BOUNCED"] }, isTest: false, ...(p ? { createdAt: within(p) } : {}) })
/** A person's answer: an inbound message not filed as an automatic out-of-office (unfiled ones count). */
const humanReply = (p?: Period): Prisma.EmailMessageWhereInput => ({ direction: "INBOUND", OR: [{ replyClass: null }, { replyClass: { not: "OUT_OF_OFFICE" } }], ...(p ? { createdAt: within(p) } : {}) })
const contactedWhere = (p?: Period): Prisma.LeadWhereInput => ({ OR: [{ emails: { some: sentEmail(p) } }, { activities: { some: { kind: "CALL", ...(p ? { occurredAt: within(p) } : {}) } } }] })
/** A booking that holds: cancelled ones never happened, a moved one lives on in its replacement. */
const heldMeeting = { status: { notIn: ["CANCELED", "RESCHEDULED"] } } satisfies Prisma.MeetingWhereInput

export interface PeriodCounts {
  leads: number
  contacted: number
  replied: number
  qualified: number
  meetings: number
  won: number
}

/** Activity of a period, each step defined in INDICATORS. */
export async function periodCounts(user: CurrentUser, p: Period, extra: Prisma.LeadWhereInput = {}): Promise<PeriodCounts> {
  const leads = visibleLeads(user, extra)
  const [created, contacted, replied, qualified, meetings, won] = await Promise.all([
    prisma.lead.count({ where: { AND: [leads, { createdAt: within(p) }] } }),
    prisma.lead.count({ where: { AND: [leads, contactedWhere(p)] } }),
    prisma.lead.count({ where: { AND: [leads, { emails: { some: humanReply(p) } }] } }),
    prisma.deal.count({ where: { workspaceId: user.workspaceId, createdAt: within(p), lead: { is: leads } } }),
    prisma.meeting.count({ where: { workspaceId: user.workspaceId, createdAt: within(p), ...heldMeeting, lead: { is: leads } } }),
    prisma.deal.count({ where: { workspaceId: user.workspaceId, stage: "WON", wonAt: within(p), lead: { is: leads } } }),
  ])
  return { leads: created, contacted, replied, qualified, meetings, won }
}

export interface CohortCounts extends PeriodCounts {
  replyRate: number | null
  conversion: number | null
}

/**
 * How far the fiches of each campaign went (a cohort, whole life of the campaign): one grouped count per step, all
 * limited to the fiches the person sees.
 */
export async function campaignCohorts(user: CurrentUser, campaignIds: string[]): Promise<Map<string, CohortCounts>> {
  const out = new Map<string, CohortCounts>()
  if (campaignIds.length === 0) return out
  const base = visibleLeads(user, { campaignId: { in: campaignIds } })
  const count = (extra: Prisma.LeadWhereInput) =>
    prisma.lead.groupBy({ by: ["campaignId"], where: { AND: [base, extra] }, _count: { _all: true } })
  const [leads, contacted, replied, qualified, meetings, won] = await Promise.all([
    count({}),
    count(contactedWhere()),
    count({ emails: { some: humanReply() } }),
    count({ deals: { some: {} } }),
    count({ meetings: { some: heldMeeting } }),
    count({ deals: { some: { stage: "WON" } } }),
  ])
  const pick = (rows: { campaignId: string | null; _count: { _all: number } }[], id: string) => rows.find((r) => r.campaignId === id)?._count._all ?? 0
  for (const id of campaignIds) {
    const c = { leads: pick(leads, id), contacted: pick(contacted, id), replied: pick(replied, id), qualified: pick(qualified, id), meetings: pick(meetings, id), won: pick(won, id) }
    out.set(id, { ...c, replyRate: rate(c.replied, c.contacted), conversion: rate(c.meetings, c.leads) })
  }
  return out
}

/**
 * How far the fiches matching `extra` went, whole life (the campaigns' definitions): what the Stratège reads for a
 * sector (E25). Limited to the fiches the person sees.
 */
export async function cohortOf(user: CurrentUser, extra: Prisma.LeadWhereInput): Promise<CohortCounts> {
  const base = visibleLeads(user, extra)
  const count = (more: Prisma.LeadWhereInput) => prisma.lead.count({ where: { AND: [base, more] } })
  const [leads, contacted, replied, qualified, meetings, won] = await Promise.all([
    count({}),
    count(contactedWhere()),
    count({ emails: { some: humanReply() } }),
    count({ deals: { some: {} } }),
    count({ meetings: { some: heldMeeting } }),
    count({ deals: { some: { stage: "WON" } } }),
  ])
  return { leads, contacted, replied, qualified, meetings, won, replyRate: rate(replied, contacted), conversion: rate(meetings, leads) }
}

/** The sectors the person's fiches come from, most frequent first (the companies' sector as imported). */
export async function topSectors(user: CurrentUser, limit = 10): Promise<{ sector: string; leads: number }[]> {
  const rows = await prisma.company.groupBy({
    by: ["sector"],
    where: { workspaceId: user.workspaceId, sector: { not: null }, leads: { some: visibleLeads(user) } },
    _count: { _all: true },
    orderBy: { _count: { sector: "desc" } },
    take: limit,
  })
  return rows.filter((r) => r.sector).map((r) => ({ sector: r.sector!, leads: r._count._all }))
}

/** Weekly series (oldest first) of fiches created and meetings booked, for the small charts. */
export async function weeklySeries(user: CurrentUser, weeks = 8, now = new Date(), extra: Prisma.LeadWhereInput = {}) {
  const leads = visibleLeads(user, extra)
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const to = new Date(now.getTime() - (weeks - 1 - i) * 7 * 86_400_000)
    return { from: new Date(to.getTime() - 7 * 86_400_000), to }
  })
  return Promise.all(
    buckets.map(async (b) => {
      const [created, meetings] = await Promise.all([
        prisma.lead.count({ where: { AND: [leads, { createdAt: within(b) }] } }),
        prisma.meeting.count({ where: { workspaceId: user.workspaceId, createdAt: within(b), ...heldMeeting, lead: { is: leads } } }),
      ])
      return { weekEnding: b.to.toISOString(), leads: created, meetings }
    })
  )
}
