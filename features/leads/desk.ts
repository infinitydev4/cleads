import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { dayBounds } from "@/lib/crm/day"

/** A day's target of calls for the closer's progress bar: indicative, not a quota anyone enforces. The team's own
 * figure lives on the workspace (owners and managers set it in « Mes closers »); this is its default. */
export const DAILY_CALLS = 40
export const CALL_GOAL_LIMITS = { min: 1, max: 500 } as const

export async function dailyCallGoal(workspaceId: string): Promise<number> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { dailyCallGoal: true } })
  return ws?.dailyCallGoal ?? DAILY_CALLS
}

/** Owners and managers only (team:dispatch), checked by the route. */
export async function setDailyCallGoal(workspaceId: string, goal: number): Promise<number> {
  const value = Math.round(goal)
  if (!Number.isFinite(value) || value < CALL_GOAL_LIMITS.min || value > CALL_GOAL_LIMITS.max) throw new RangeError("goal")
  await prisma.workspace.update({ where: { id: workspaceId }, data: { dailyCallGoal: value } })
  return value
}

export interface DeskStats {
  /** Calls the person logged today, and how many reached someone. */
  calls: number
  reached: number
  goal: number
  /** Meetings ahead that the person hosts. */
  meetings: number
  /** Opportunities the person won this calendar month. */
  wonThisMonth: number
}

/** The closer's cockpit (9 November 2026): the four figures above his call file, all his own. */
export async function deskStats(user: CurrentUser, now = new Date()): Promise<DeskStats> {
  const { start, end } = dayBounds(now)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [calls, meetings, wonThisMonth, goal] = await Promise.all([
    prisma.activity.findMany({ where: { workspaceId: user.workspaceId, actorId: user.id, kind: "CALL", occurredAt: { gte: start, lt: end } }, select: { data: true } }),
    prisma.meeting.count({ where: { workspaceId: user.workspaceId, hostId: user.id, status: { in: ["SCHEDULED", "CONFIRMED"] }, startsAt: { gte: now } } }),
    prisma.deal.count({ where: { workspaceId: user.workspaceId, ownerId: user.id, stage: "WON", wonAt: { gte: monthStart } } }),
    dailyCallGoal(user.workspaceId),
  ])
  const reached = calls.filter((c) => (c.data as { outcome?: unknown } | null)?.outcome === "reached").length
  return { calls: calls.length, reached, goal, meetings, wonThisMonth }
}
