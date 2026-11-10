import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { addDays, dayKey, startOfDay } from "@/lib/crm/day"
import { LeadError } from "@/features/leads/errors"
import { answered } from "./rules"

export const CALL_PERIODS = { today: "Aujourd’hui", week: "7 derniers jours", month: "Ce mois" } as const
export type CallPeriod = keyof typeof CALL_PERIODS

export interface CallerRow {
  id: string
  name: string
  extension: string | null
  calls: number
  answered: number
  talkSec: number
  lastAt: string | null
}

export interface RecentCall {
  id: string
  leadId: string | null
  leadName: string
  userName: string | null
  direction: "OUTBOUND" | "INBOUND"
  startedAt: string
  durationSec: number
  disposition: string
  outcome: string | null
  recorded: boolean
}

export interface CallBoard {
  periods: Record<CallPeriod, { calls: number; answered: number; talkSec: number; meetings: number; rows: CallerRow[] }>
  recent: RecentCall[]
}

/** The first instant of each period, in Paris days: today, the last seven days, the calendar month. */
export function periodStarts(now: Date): Record<CallPeriod, Date> {
  const today = dayKey(now)
  return { today: startOfDay(today), week: startOfDay(addDays(today, -6)), month: startOfDay(`${today.slice(0, 8)}01`) }
}

/**
 * The managers' board of real calls (E32 lot 2, maquette « Mes closers : appels »): per member with an extension or a
 * closer's role, the calls the PBX reported, how many were picked up, the time spent talking; the team's meetings; the
 * last calls with what the closer made of them.
 */
export async function callBoard(user: CurrentUser, now = new Date()): Promise<CallBoard> {
  if (!can(user.role, "team:dispatch")) throw new LeadError("forbidden", "Réservé aux managers.", 403)
  const ws = user.workspaceId
  const starts = periodStarts(now)
  const since = new Date(Math.min(...Object.values(starts).map((d) => d.getTime())))

  const [members, calls, meetings, latest] = await Promise.all([
    prisma.user.findMany({ where: { workspaceId: ws, active: true, OR: [{ role: "CLOSER" }, { zadarmaExtension: { not: null } }] }, select: { id: true, name: true, email: true, zadarmaExtension: true }, orderBy: { name: "asc" } }),
    prisma.phoneCall.findMany({ where: { workspaceId: ws, startedAt: { gte: since } }, select: { userId: true, disposition: true, durationSec: true, startedAt: true } }),
    prisma.meeting.findMany({ where: { workspaceId: ws, createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.phoneCall.findMany({
      where: { workspaceId: ws },
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { user: { select: { name: true, email: true } }, lead: { select: { company: { select: { name: true } }, contact: { select: { name: true } } } } },
    }),
  ])

  const periods = Object.fromEntries(
    (Object.keys(CALL_PERIODS) as CallPeriod[]).map((p) => {
      const inPeriod = calls.filter((c) => c.startedAt >= starts[p])
      const talk = (list: typeof inPeriod) => list.filter((c) => answered(c.disposition)).reduce((sum, c) => sum + c.durationSec, 0)
      const rows = members.map((m) => {
        const own = inPeriod.filter((c) => c.userId === m.id)
        const last = own.reduce<Date | null>((at, c) => (!at || c.startedAt > at ? c.startedAt : at), null)
        return { id: m.id, name: m.name ?? m.email ?? "Membre", extension: m.zadarmaExtension, calls: own.length, answered: own.filter((c) => answered(c.disposition)).length, talkSec: talk(own), lastAt: last?.toISOString() ?? null }
      })
      return [p, { calls: inPeriod.length, answered: inPeriod.filter((c) => answered(c.disposition)).length, talkSec: talk(inPeriod), meetings: meetings.filter((m) => m.createdAt >= starts[p]).length, rows }]
    })
  ) as CallBoard["periods"]

  // What the closer said of each call lives on the CALL activity that points to it.
  const leadIds = [...new Set(latest.flatMap((c) => (c.leadId ? [c.leadId] : [])))]
  const activities = leadIds.length ? await prisma.activity.findMany({ where: { leadId: { in: leadIds }, kind: "CALL" }, select: { data: true } }) : []
  const outcomes = new Map<string, string>()
  for (const a of activities) {
    const d = a.data as { phoneCallId?: unknown; outcome?: unknown } | null
    if (typeof d?.phoneCallId === "string" && typeof d.outcome === "string") outcomes.set(d.phoneCallId, d.outcome)
  }
  const recent = latest.map((c) => ({
    id: c.id,
    leadId: c.leadId,
    leadName: c.lead?.company?.name ?? c.lead?.contact?.name ?? c.number,
    userName: c.user?.name ?? c.user?.email ?? null,
    direction: c.direction,
    startedAt: c.startedAt.toISOString(),
    durationSec: c.durationSec,
    disposition: c.disposition,
    outcome: outcomes.get(c.id) ?? null,
    recorded: Boolean(c.recordingId),
  }))
  return { periods, recent }
}

export interface CallDay {
  day: string
  calls: number
  answered: number
  talkSec: number
}

/**
 * Calls day by day over a report's period (maquette « Mes résultats »): the CALL activities, the member's own or the
 * team's. Picked up means the closer said « Joint » or the PBX said answered; talk time comes from the PBX.
 */
export async function callsByDay(user: CurrentUser, from: Date, to: Date, scope: "own" | "all"): Promise<CallDay[]> {
  const rows = await prisma.activity.findMany({
    where: { workspaceId: user.workspaceId, kind: "CALL", occurredAt: { gte: from, lt: to }, ...(scope === "own" ? { actorId: user.id } : {}) },
    select: { occurredAt: true, data: true },
  })
  const days = new Map<string, CallDay>()
  for (let key = dayKey(from); startOfDay(key) < to; key = addDays(key, 1)) days.set(key, { day: key, calls: 0, answered: 0, talkSec: 0 })
  for (const r of rows) {
    const d = (r.data ?? {}) as { outcome?: unknown; disposition?: unknown; durationSec?: unknown }
    const slot = days.get(dayKey(r.occurredAt))
    if (!slot) continue
    slot.calls += 1
    const picked = d.outcome === "reached" || (typeof d.disposition === "string" && answered(d.disposition))
    if (picked) {
      slot.answered += 1
      slot.talkSec += typeof d.durationSec === "number" ? d.durationSec : 0
    }
  }
  return [...days.values()]
}
