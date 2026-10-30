import type { Prisma } from "@prisma/client"
import type { CurrentUser } from "@/lib/auth/guard"
import { canAccessRecord } from "@/lib/rbac"
import { TEAM_TZ, startOfDay } from "@/lib/crm/day"

export type Tx = Prisma.TransactionClient

const dayLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: TEAM_TZ })
export const formatDay = (d: Date) => dayLabel.format(d)

/** Every write to a fiche's history goes through here, so nothing happens without leaving a trace. */
export async function logTask(tx: Tx, user: CurrentUser, leadId: string, body: string, data?: Prisma.InputJsonValue, dealId?: string | null) {
  await tx.activity.create({ data: { workspaceId: user.workspaceId, leadId, dealId: dealId ?? undefined, actorId: user.id, actorKind: "USER", kind: "TASK", body, data } })
}

/** The instant a task due on a calendar day is stored at: that day's start in Paris. */
export const dueAtOf = (dueDay: string | null | undefined) => (dueDay ? startOfDay(dueDay) : null)

export async function insertTask(tx: Tx, user: CurrentUser, input: { leadId: string; title: string; dueDay?: string | null; assigneeId: string | null }) {
  const dueAt = dueAtOf(input.dueDay)
  const task = await tx.task.create({
    data: { workspaceId: user.workspaceId, leadId: input.leadId, title: input.title, dueAt, assigneeId: input.assigneeId, createdById: user.id },
  })
  await logTask(tx, user, input.leadId, `Tâche créée : ${input.title}${dueAt ? ` (pour ${formatDay(dueAt)})` : ""}`, { event: "created", taskId: task.id, dueDay: input.dueDay ?? null, assigneeId: input.assigneeId })
  return task
}

/** A disqualified or do-not-contact prospect gets no more follow-ups: what was planned is closed, with the reason in the history. */
export async function closeOpenTasks(tx: Tx, user: CurrentUser, leadId: string, reason: string) {
  const open = await tx.task.findMany({ where: { leadId, doneAt: null }, select: { id: true, title: true } })
  for (const t of open) {
    await tx.task.update({ where: { id: t.id }, data: { doneAt: new Date() } })
    await logTask(tx, user, leadId, `Tâche abandonnée : ${t.title} (${reason})`, { event: "dropped", taskId: t.id })
  }
  return open.length
}

interface Workable {
  ownerId: string | null
  deals: { ownerId: string | null; stage: string }[]
}

const OPEN = ["QUALIFIED", "MEETING_SET", "PROPOSAL", "NEGOTIATION"]

/**
 * May this person note, call or plan on the fiche? Those who may write it, plus the closer who holds its open
 * opportunity: they work the prospect without owning the fiche.
 */
export function canWorkLead(user: CurrentUser, lead: Workable): boolean {
  if (canAccessRecord(user, "lead:write", lead.ownerId)) return true
  return user.role === "CLOSER" && lead.deals.some((d) => d.ownerId === user.id && OPEN.includes(d.stage))
}
