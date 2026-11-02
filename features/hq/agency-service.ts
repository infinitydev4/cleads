import type { AgentRunStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { dayBounds } from "@/lib/crm/day"
import { aiConfigured } from "@/lib/ai/gateway"
import { ACTIVE_RUN_STATUSES, commitments, getAiSettings, microsToEur } from "@/lib/ai/budget"
import { AGENT_IDS } from "@/features/ai/agents"
import { listApprovals } from "@/features/ai/approvals"
import { agentViews } from "@/features/ai/definitions"
import { workerStatus } from "@/features/ai/queue"
import { isManager, listRuns } from "@/features/ai/runs"
import { visibleLeads } from "@/features/metrics/service"
import { listSites, renderPath } from "@/features/studio/service"
import { JUST_DONE_MS, agentStateOf } from "./agency"
import type { AgencyPulse, AgentPulse, StudioPulse, ZoneDetail } from "./types"

/**
 * The AI agency of the 3D view (E26), read with the rules of the 2D pages: runs and approvals of the whole workspace for
 * owners and managers and one's own for the others (Agents IA), mock-ups of the fiches the person sees (Studio Web).
 */

const leadSelect = { id: true, company: { select: { name: true } }, contact: { select: { name: true, email: true } } } satisfies Prisma.LeadSelect
const leadName = (l: Prisma.LeadGetPayload<{ select: typeof leadSelect }>) => l.company?.name ?? l.contact?.name ?? l.contact?.email ?? "Fiche"

const runScope = (user: CurrentUser): Prisma.AgentRunWhereInput => ({ workspaceId: user.workspaceId, ...(isManager(user) ? {} : { requestedById: user.id }) })
const siteScope = (user: CurrentUser): Prisma.GeneratedSiteWhereInput => ({ workspaceId: user.workspaceId, status: { not: "PURGED" }, lead: { is: visibleLeads(user) } })
const ACTIVE = [...ACTIVE_RUN_STATUSES]

/** What each agent is doing, what waits for the person and the Studio's latest work: light enough to poll. */
export async function agencyPulse(user: CurrentUser, now = new Date()): Promise<AgencyPulse | null> {
  if (!can(user.role, "ai:use")) return null
  const scope = runScope(user)
  const { start } = dayBounds(now)
  const [active, today, done, approvals, switches, worker, studio] = await Promise.all([
    prisma.agentRun.findMany({ where: { ...scope, status: { in: ACTIVE } }, select: { id: true, agentId: true, status: true, lead: { select: leadSelect } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.agentRun.groupBy({ by: ["agentId"], where: { ...scope, createdAt: { gte: start } }, _count: { _all: true }, _sum: { costMicros: true } }),
    // Bounded by creation date too, so the (workspaceId, createdAt) index serves it.
    prisma.agentRun.findMany({
      where: { ...scope, createdAt: { gte: new Date(now.getTime() - 6 * 3600_000) }, finishedAt: { gte: new Date(now.getTime() - JUST_DONE_MS) } },
      select: { id: true, agentId: true, status: true, finishedAt: true },
      orderBy: { finishedAt: "desc" },
      take: 20,
    }),
    prisma.agentApproval.count({ where: { workspaceId: user.workspaceId, status: "PENDING", ...(isManager(user) ? {} : { requestedById: user.id }) } }),
    prisma.agentDefinition.findMany({ where: { workspaceId: user.workspaceId }, select: { agentId: true, enabled: true } }),
    workerStatus(user.workspaceId, now),
    can(user.role, "studio:generate") ? studioPulse(user) : Promise.resolve(null),
  ])
  const enabled = new Map(switches.map((s) => [s.agentId, s.enabled]))
  const agents = AGENT_IDS.map((id): AgentPulse => {
    const runs = active.filter((r) => r.agentId === id)
    const count = (status: AgentRunStatus) => runs.filter((r) => r.status === status).length
    const [running, queued, waiting] = [count("RUNNING"), count("QUEUED"), count("WAITING_APPROVAL")]
    const shown = runs.find((r) => r.status === "RUNNING") ?? runs.find((r) => r.status === "WAITING_APPROVAL") ?? runs[0]
    const day = today.find((t) => t.agentId === id)
    const last = done.find((r) => r.agentId === id)
    return {
      id,
      state: agentStateOf({ enabled: enabled.get(id) ?? true, running, queued, waiting }),
      running,
      queued,
      waiting,
      current: shown ? { runId: shown.id, lead: shown.lead ? { id: shown.lead.id, name: leadName(shown.lead) } : null } : null,
      lastDone: last?.finishedAt ? { runId: last.id, ok: last.status === "SUCCEEDED", finishedAt: last.finishedAt.toISOString() } : null,
      today: { runs: day?._count._all ?? 0, costEur: microsToEur(day?._sum.costMicros ?? 0) },
    }
  })
  return { generatedAt: now.toISOString(), agents, approvals, worker: { online: worker.online, queued: worker.queued }, configured: aiConfigured(), studio }
}

async function studioPulse(user: CurrentUser): Promise<StudioPulse> {
  const where = siteScope(user)
  const published: Prisma.GeneratedSiteWhereInput = { ...where, currentVersion: { not: null } }
  const [latest, briefs, ready, making] = await Promise.all([
    prisma.generatedSite.findMany({ where: published, orderBy: { updatedAt: "desc" }, take: 4, select: { id: true, companyName: true, currentVersion: true, lead: { select: { company: { select: { name: true } } } } } }),
    prisma.generatedSite.count({ where: { ...where, status: "BRIEF_READY" } }),
    prisma.generatedSite.count({ where: published }),
    prisma.generatedSite.findMany({ where: { ...where, status: { in: ["BRIEFING", "BUILDING"] }, lastRunId: { not: null } }, select: { lastRunId: true } }),
  ])
  // A site stays BRIEFING or BUILDING after a failed run: only an active run means work in progress.
  const building = making.length ? await prisma.agentRun.count({ where: { id: { in: making.map((s) => s.lastRunId!) }, status: { in: ACTIVE } } }) : 0
  return {
    latest: latest.map((s) => ({ id: s.id, name: s.lead.company?.name ?? s.companyName, thumb: renderPath(s.id, s.currentVersion!, "thumb"), version: s.currentVersion! })),
    building,
    briefs,
    ready,
  }
}

/** The "Agents IA" space in detail: the agents, what waits for a decision, the latest runs, the month's spending. */
export async function agentsZone(user: CurrentUser, now = new Date()): Promise<Extract<ZoneDetail, { zone: "agents" }>> {
  const [page, approvals, runs, settings, spent, worker] = await Promise.all([
    agentViews(user),
    listApprovals(user),
    // Enough for each agent's latest runs in its own panel.
    listRuns(user, { limit: 30 }),
    getAiSettings(user.workspaceId),
    commitments(prisma, user.workspaceId, user.id, now),
    workerStatus(user.workspaceId, now),
  ])
  return {
    zone: "agents",
    agents: page.agents.map((a) => ({ id: a.id, label: a.label, mission: a.mission, output: a.output, approval: a.approval, model: a.model, enabled: a.enabled })),
    approvals,
    runs,
    month: { spentEur: microsToEur(spent.monthSpent), capEur: microsToEur(settings.monthlyCapMicros) },
    worker,
    configured: aiConfigured(),
  }
}

/** The "Studio Web" space in detail: the latest mock-ups and where the others stand. */
export async function studioZone(user: CurrentUser): Promise<Extract<ZoneDetail, { zone: "studio" }>> {
  const [sites, pulse, visits] = await Promise.all([listSites(user, { limit: 8 }), studioPulse(user), prisma.generatedSite.aggregate({ where: siteScope(user), _sum: { visitCount: true } })])
  return { zone: "studio", sites, counts: { ready: pulse.ready, building: pulse.building, briefs: pulse.briefs, visits: visits._sum.visitCount ?? 0 } }
}
