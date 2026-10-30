import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { can, scopeOf } from "@/lib/rbac"
import { dayBounds, snoozeTargets } from "@/lib/crm/day"
import { scopeWhere } from "@/features/leads/service"
import { OPEN_STAGES } from "@/features/pipeline/rules"
import { canWorkLead } from "./core"
import { canChangeTask } from "./rules"

const iso = (d: Date | null) => d?.toISOString() ?? null
const who = (u: { name: string | null; email: string | null } | null) => u?.name ?? u?.email ?? null

export interface TodayTask {
  id: string
  title: string
  dueAt: string | null
  assigneeId: string | null
  assigneeName: string | null
  leadId: string
  leadName: string
  city: string | null
  phone: string | null
  contactName: string | null
  canChange: boolean
}

export interface TodayMeeting {
  id: string
  leadId: string | null
  leadName: string
  startsAt: string
  hostName: string | null
  status: string
}

export interface Suggestion {
  leadId: string
  leadName: string
  city: string | null
  phone: string | null
  reason: "replied" | "deal_without_next_step" | "to_contact"
  detail: string
}

export interface Today {
  scope: "mine" | "team"
  /** Calendar day (Paris) the file was computed for, and the postponement targets that go with it. */
  today: string
  snooze: { id: string; label: string; day: string }[]
  overdue: TodayTask[]
  dueToday: TodayTask[]
  upcoming: TodayTask[]
  undated: TodayTask[]
  meetings: TodayMeeting[]
  /** Over and still open: the result is owed. */
  meetingsToClose: TodayMeeting[]
  suggestions: Suggestion[]
  canSeeTeam: boolean
}

const taskInclude = {
  assignee: { select: { name: true, email: true } },
  lead: {
    select: {
      id: true,
      ownerId: true,
      status: true,
      deals: { select: { ownerId: true, stage: true } },
      company: { select: { name: true, city: true, phone: true } },
      contact: { select: { name: true, phone: true, email: true } },
    },
  },
} satisfies Prisma.TaskInclude

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>

/** Whether the person may see the whole team's file: those who read every fiche. */
export const canSeeTeam = (user: CurrentUser) => scopeOf(user.role, "lead:read") === "all"

export async function getToday(user: CurrentUser, requested: "mine" | "team" = "mine", now = new Date()): Promise<Today> {
  const scope = requested === "team" && canSeeTeam(user) ? "team" : "mine"
  const { today, start, end } = dayBounds(now)
  const visible: Prisma.TaskWhereInput = scope === "mine" ? { assigneeId: user.id } : { lead: { is: { workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") } } }
  const base: Prisma.TaskWhereInput = { workspaceId: user.workspaceId, doneAt: null, leadId: { not: null }, ...visible }

  const toTask = (t: TaskRow): TodayTask => ({
    id: t.id,
    title: t.title,
    dueAt: iso(t.dueAt),
    assigneeId: t.assigneeId,
    assigneeName: who(t.assignee),
    leadId: t.lead!.id,
    leadName: t.lead!.company?.name ?? t.lead!.contact?.name ?? t.lead!.contact?.email ?? "Sans nom",
    city: t.lead!.company?.city ?? null,
    phone: t.lead!.contact?.phone ?? t.lead!.company?.phone ?? null,
    contactName: t.lead!.contact?.name ?? null,
    canChange: canChangeTask(user, t, canWorkLead(user, t.lead!)),
  })

  const [due, upcoming, undated, meetings, meetingsToClose, suggestions] = await Promise.all([
    prisma.task.findMany({ where: { ...base, dueAt: { lt: end } }, include: taskInclude, orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }], take: 300 }),
    prisma.task.findMany({ where: { ...base, dueAt: { gte: end } }, include: taskInclude, orderBy: { dueAt: "asc" }, take: 15 }),
    prisma.task.findMany({ where: { ...base, dueAt: null }, include: taskInclude, orderBy: { createdAt: "asc" }, take: 15 }),
    todayMeetings(user, scope, start, end),
    todayMeetings(user, scope, new Date(0), now, true),
    scope === "mine" ? suggest(user) : Promise.resolve([]),
  ])

  return {
    scope,
    today,
    snooze: snoozeTargets(today),
    overdue: due.filter((t) => t.dueAt! < start).map(toTask),
    dueToday: due.filter((t) => t.dueAt! >= start).map(toTask),
    upcoming: upcoming.map(toTask),
    undated: undated.map(toTask),
    meetings,
    meetingsToClose,
    suggestions,
    canSeeTeam: canSeeTeam(user),
  }
}

async function todayMeetings(user: CurrentUser, scope: "mine" | "team", start: Date, end: Date, overOnly = false): Promise<TodayMeeting[]> {
  if (!can(user.role, "meeting:read")) return []
  const rows = await prisma.meeting.findMany({
    where: { workspaceId: user.workspaceId, ...(overOnly ? { endsAt: { lt: end } } : { startsAt: { gte: start, lt: end } }), status: { in: ["SCHEDULED", "CONFIRMED"] }, ...(scope === "mine" || scopeOf(user.role, "meeting:read") === "own" ? { hostId: user.id } : {}) },
    include: { host: { select: { name: true, email: true } }, lead: { select: { company: { select: { name: true } }, contact: { select: { name: true } } } } },
    orderBy: { startsAt: "asc" },
    take: 50,
  })
  return rows.map((m) => ({ id: m.id, leadId: m.leadId, leadName: m.lead?.company?.name ?? m.lead?.contact?.name ?? "Rendez-vous", startsAt: m.startsAt.toISOString(), hostName: who(m.host), status: m.status }))
}

/**
 * What deserves a next step but has none, by role. The file is not only the tasks someone remembered to write:
 * a prospect who answered, an opportunity nobody planned anything on, a fiche never contacted.
 */
async function suggest(user: CurrentUser): Promise<Suggestion[]> {
  const noOpenTask: Prisma.LeadWhereInput = { tasks: { none: { doneAt: null } } }
  const card = (l: { id: string; company: { name: string; city: string | null; phone: string | null } | null; contact: { name: string | null; phone: string | null } | null }) => ({
    leadId: l.id,
    leadName: l.company?.name ?? l.contact?.name ?? "Sans nom",
    city: l.company?.city ?? null,
    phone: l.contact?.phone ?? l.company?.phone ?? null,
  })
  const select = { id: true, company: { select: { name: true, city: true, phone: true } }, contact: { select: { name: true, phone: true } } } satisfies Prisma.LeadSelect
  const out: Suggestion[] = []

  if (can(user.role, "lead:write")) {
    const replied = await prisma.lead.findMany({ where: { workspaceId: user.workspaceId, ownerId: user.id, status: "REPLIED", ...noOpenTask }, select, orderBy: { lastContactedAt: "desc" }, take: 10 })
    out.push(...replied.map((l) => ({ ...card(l), reason: "replied" as const, detail: "A répondu, rien de prévu" })))
  }
  if (can(user.role, "deal:move")) {
    const deals = await prisma.deal.findMany({
      where: { workspaceId: user.workspaceId, ownerId: user.id, stage: { in: [...OPEN_STAGES] }, lead: { is: noOpenTask } },
      select: { lead: { select }, stage: true },
      orderBy: { updatedAt: "asc" },
      take: 10,
    })
    out.push(...deals.map((d) => ({ ...card(d.lead), reason: "deal_without_next_step" as const, detail: "Opportunité sans prochaine étape" })))
  }
  if (user.role === "SDR") {
    const fresh = await prisma.lead.findMany({
      where: { workspaceId: user.workspaceId, ownerId: user.id, status: "NEW", ...noOpenTask, OR: [{ contact: { phone: { not: null } } }, { company: { phone: { not: null } } }] },
      select,
      orderBy: [{ score: "desc" }, { createdAt: "asc" }],
      take: 10,
    })
    out.push(...fresh.map((l) => ({ ...card(l), reason: "to_contact" as const, detail: "À contacter" })))
  }
  const seen = new Set<string>()
  return out.filter((s) => (seen.has(s.leadId) ? false : (seen.add(s.leadId), true)))
}
