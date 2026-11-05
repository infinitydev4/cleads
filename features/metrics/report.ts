import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { AuthError } from "@/lib/auth/errors"
import type { CurrentUser } from "@/lib/auth/guard"
import { CRM_ROLES, toCrmRole, type CrmRole } from "@/lib/crm/roles"
import { scopeOf } from "@/lib/rbac"
import { rate } from "./definitions"
import { shiftPeriod, type ReportPeriod } from "./periods"
import { heldMeeting, periodCounts, type PeriodCounts } from "./service"
import { wonCsv } from "./won-csv"

/**
 * The reports (E10, docs/crm-v1/RAPPORTS.md): the period's funnel, what each person did (PERSON_INDICATORS) and the
 * opportunities won. Owners, managers and viewers see the whole team; an SDR or a closer sees their own figures (report:read).
 */

export interface Amount {
  currency: string
  cents: number
}

export interface PersonRow {
  userId: string
  name: string
  role: CrmRole
  active: boolean
  contacted: number
  replied: number
  qualified: number
  meetingsBooked: number
  meetingsHeld: number
  won: number
  lost: number
  wonAmounts: Amount[]
  /** Won without an amount: before the rule of D56. */
  wonWithoutAmount: number
  winRate: number | null
}

export interface WonRow {
  dealId: string
  leadId: string
  wonAt: string
  company: string
  owner: string | null
  createdBy: string | null
  amountCents: number | null
  currency: string
}

export interface WonList {
  rows: WonRow[]
  totals: Amount[]
  withoutAmount: number
}

export interface Report {
  period: ReportPeriod
  previous: ReportPeriod
  scope: "all" | "own"
  funnel: { current: PeriodCounts; previous: PeriodCounts }
  people: PersonRow[]
  won: WonList
}

const within = (p: { from: Date; to: Date }) => ({ gte: p.from, lt: p.to })
const personName = (u: { name: string | null; email: string | null } | null) => (u ? (u.name ?? u.email ?? "—") : null)

function reportScope(user: CurrentUser): "all" | "own" {
  const scope = scopeOf(user.role, "report:read")
  if (!scope) throw new AuthError(403)
  return scope === "all" ? "all" : "own"
}

/** The fiches someone's own reports cover: theirs, those of their opportunities and of the meetings they host. */
const ownLeads = (user: CurrentUser): Prisma.LeadWhereInput => ({ OR: [{ ownerId: user.id }, { deals: { some: { ownerId: user.id } } }, { meetings: { some: { hostId: user.id } } }] })

function addAmount(list: Amount[], currency: string, cents: number) {
  const found = list.find((a) => a.currency === currency)
  if (found) found.cents += cents
  else list.push({ currency, cents })
}

async function wonDeals(user: CurrentUser, period: ReportPeriod, scope: "all" | "own") {
  return prisma.deal.findMany({
    where: { workspaceId: user.workspaceId, stage: "WON", wonAt: within(period), ...(scope === "own" ? { OR: [{ ownerId: user.id }, { createdById: user.id }] } : {}) },
    select: {
      id: true,
      leadId: true,
      wonAt: true,
      amountCents: true,
      currency: true,
      ownerId: true,
      owner: { select: { name: true, email: true } },
      createdBy: { select: { name: true, email: true } },
      lead: { select: { company: { select: { name: true } }, contact: { select: { name: true } } } },
    },
    orderBy: { wonAt: "asc" },
  })
}

function wonList(deals: Awaited<ReturnType<typeof wonDeals>>): WonList {
  const totals: Amount[] = []
  let withoutAmount = 0
  const rows = deals.map((d) => {
    if (d.amountCents == null) withoutAmount++
    else addAmount(totals, d.currency, d.amountCents)
    return {
      dealId: d.id,
      leadId: d.leadId,
      wonAt: d.wonAt!.toISOString(),
      company: d.lead.company?.name ?? d.lead.contact?.name ?? "Sans nom",
      owner: personName(d.owner),
      createdBy: personName(d.createdBy),
      amountCents: d.amountCents,
      currency: d.currency,
    }
  })
  return { rows, totals, withoutAmount }
}

/** How many distinct fiches each person reached, from (person, fiche) pairs. */
function distinctPerPerson(pairs: { person: string | null; leadId: string | null }[]) {
  const sets = new Map<string, Set<string>>()
  for (const { person, leadId } of pairs) {
    if (!person || !leadId) continue
    if (!sets.has(person)) sets.set(person, new Set())
    sets.get(person)!.add(leadId)
  }
  return (id: string) => sets.get(id)?.size ?? 0
}

const countBy = <K extends string>(rows: ({ _count: { _all: number } } & Record<K, string | null>)[], key: K) => {
  const map = new Map<string | null, number>(rows.map((r) => [r[key] as string | null, r._count._all]))
  return (id: string) => map.get(id) ?? 0
}

export async function reportOf(user: CurrentUser, period: ReportPeriod): Promise<Report> {
  const scope = reportScope(user)
  const ws = user.workspaceId
  const previous = shiftPeriod(period, -1)
  const extra = scope === "own" ? ownLeads(user) : {}

  const members = await prisma.user.findMany({
    where: { workspaceId: ws, role: { in: [...CRM_ROLES, "ADMIN"] }, ...(scope === "own" ? { id: user.id } : {}) },
    select: { id: true, name: true, email: true, role: true, active: true },
    orderBy: { name: "asc" },
  })
  const ids = members.map((m) => m.id)
  const inPeriod = within(period)
  const humanReply: Prisma.EmailMessageWhereInput = { direction: "INBOUND", OR: [{ replyClass: null }, { replyClass: { not: "OUT_OF_OFFICE" } }] }

  const [current, before, outbound, calls, replies, created, booked, held, lost, won] = await Promise.all([
    periodCounts(user, period, extra),
    periodCounts(user, previous, extra),
    prisma.emailMessage.findMany({
      where: { workspaceId: ws, direction: "OUTBOUND", status: { in: ["SENT", "BOUNCED"] }, isTest: false, createdAt: inPeriod, leadId: { not: null }, mailbox: { ownerId: { in: ids } } },
      select: { leadId: true, mailbox: { select: { ownerId: true } } },
      distinct: ["leadId", "mailboxId"],
    }),
    prisma.activity.findMany({ where: { workspaceId: ws, kind: "CALL", occurredAt: inPeriod, leadId: { not: null }, actorId: { in: ids } }, select: { leadId: true, actorId: true }, distinct: ["leadId", "actorId"] }),
    prisma.emailMessage.findMany({
      where: { workspaceId: ws, ...humanReply, createdAt: inPeriod, leadId: { not: null }, mailbox: { ownerId: { in: ids } } },
      select: { leadId: true, mailbox: { select: { ownerId: true } } },
      distinct: ["leadId", "mailboxId"],
    }),
    prisma.deal.groupBy({ by: ["createdById"], where: { workspaceId: ws, createdAt: inPeriod, createdById: { in: ids } }, _count: { _all: true } }),
    prisma.meeting.groupBy({ by: ["createdById"], where: { workspaceId: ws, createdAt: inPeriod, ...heldMeeting, createdById: { in: ids } }, _count: { _all: true } }),
    prisma.meeting.groupBy({ by: ["hostId"], where: { workspaceId: ws, startsAt: inPeriod, status: "COMPLETED", hostId: { in: ids } }, _count: { _all: true } }),
    prisma.deal.groupBy({ by: ["ownerId"], where: { workspaceId: ws, stage: "LOST", lostAt: inPeriod, ownerId: { in: ids } }, _count: { _all: true } }),
    wonDeals(user, period, scope),
  ])

  const contactedOf = distinctPerPerson([...outbound.map((e) => ({ person: e.mailbox.ownerId, leadId: e.leadId })), ...calls.map((c) => ({ person: c.actorId, leadId: c.leadId }))])
  const repliedOf = distinctPerPerson(replies.map((r) => ({ person: r.mailbox.ownerId, leadId: r.leadId })))
  const createdOf = countBy(created, "createdById")
  const bookedOf = countBy(booked, "createdById")
  const heldOf = countBy(held, "hostId")
  const lostOf = countBy(lost, "ownerId")

  const people = members
    .map((m): PersonRow => {
      const mine = won.filter((d) => d.ownerId === m.id)
      const wonAmounts: Amount[] = []
      for (const d of mine) if (d.amountCents != null) addAmount(wonAmounts, d.currency, d.amountCents)
      const row = {
        userId: m.id,
        name: m.name ?? m.email ?? "—",
        role: toCrmRole(m.role) ?? "VIEWER",
        active: m.active,
        contacted: contactedOf(m.id),
        replied: repliedOf(m.id),
        qualified: createdOf(m.id),
        meetingsBooked: bookedOf(m.id),
        meetingsHeld: heldOf(m.id),
        won: mine.length,
        lost: lostOf(m.id),
        wonAmounts,
        wonWithoutAmount: mine.filter((d) => d.amountCents == null).length,
      }
      return { ...row, winRate: rate(row.won, row.won + row.lost) }
    })
    // A deactivated member still shows when they did something in the period.
    .filter((r) => r.active || r.contacted + r.replied + r.qualified + r.meetingsBooked + r.meetingsHeld + r.won + r.lost > 0)

  return { period, previous, scope, funnel: { current, previous: before }, people, won: wonList(won) }
}

/** The export of the period's won opportunities (data:export, checked by the route), traced in the audit log without its content. */
export async function exportWonCsv(user: CurrentUser, period: ReportPeriod, ip?: string | null): Promise<string> {
  const { rows } = wonList(await wonDeals(user, period, reportScope(user)))
  await audit({ action: "report.exported", actorId: user.id, workspaceId: user.workspaceId, metadata: { report: "won", period: `${period.kind}:${period.key}`, rows: rows.length }, ip })
  return wonCsv(rows)
}
