import { prisma } from "@/lib/prisma"
import { aiConfigured } from "@/lib/ai/gateway"
import { dayStart } from "@/lib/ai/budget"
import { startSystemRun } from "@/features/ai/runs"
import { BRIEF_CAP_MICROS } from "./brief"
import { GEO_CAP_MICROS, GEO_REFRESH_DAYS } from "./geo"

/**
 * What the Enquêteur does without being asked (E30 lot 2), queued by the hourly job of the meeting reminders:
 * - the brief of each meeting starting within a day and a half (D51), once per meeting;
 * - the GEO probe of the good targets (D52), once a month per company, ten a day at most per workspace.
 * Both are scheduled work (no one's quota), within the agent's cap and the month's AI budget. An agent switched off
 * in Agents IA, or a server without the AI key, queues nothing.
 */
export const BRIEF_AHEAD_MS = 36 * 3600_000
/** Too close to start: the worker might not finish in time, and the closer can ask for it on the fiche. */
export const BRIEF_MIN_AHEAD_MS = 2 * 3600_000
export const GEO_DAILY_MAX = 10
/**
 * A queued probe holds its company this long. One that fails or expires lets it go by itself: before 2026-11-05 the
 * claim lasted the month, so a failed probe made its company wait for the next one.
 */
export const GEO_LEASE_DAYS = 3
const DAY = 86_400_000

const isConflict = (error: unknown) => (error as { code?: string } | null)?.code === "conflict"

export async function queueMeetingBriefs(now = new Date()): Promise<number> {
  const meetings = await prisma.meeting.findMany({
    where: { status: "SCHEDULED", startsAt: { gte: new Date(now.getTime() + BRIEF_MIN_AHEAD_MS), lte: new Date(now.getTime() + BRIEF_AHEAD_MS) }, leadId: { not: null }, lead: { companyId: { not: null } }, briefs: { none: {} } },
    select: { id: true, workspaceId: true, leadId: true },
    orderBy: { startsAt: "asc" },
    take: 50,
  })
  let queued = 0
  const off = new Set<string>()
  for (const m of meetings) {
    if (off.has(m.workspaceId)) continue
    // One try per meeting: a brief that failed is asked for again from the fiche, not every hour.
    if (await prisma.agentRun.count({ where: { workspaceId: m.workspaceId, agentId: "researcher", leadId: m.leadId, input: { path: ["meetingId"], equals: m.id } } })) continue
    try {
      await startSystemRun(m.workspaceId, { agentId: "researcher", leadId: m.leadId, status: "QUEUED", priority: 2, input: { job: "brief", meetingId: m.id }, capMicros: BRIEF_CAP_MICROS })
      queued++
    } catch (error) {
      // The agent is off, already busy on this fiche, or the month's budget is spent: the meeting goes without.
      if (!isConflict(error)) off.add(m.workspaceId)
      console.warn("[RESEARCH] brief not queued", m.id, error instanceof Error ? error.message : error)
    }
  }
  return queued
}

export async function queueGeoProbes(now = new Date()): Promise<number> {
  const since = dayStart(now)
  const stale = new Date(now.getTime() - GEO_REFRESH_DAYS * DAY)
  const workspaces = await prisma.workspace.findMany({ select: { id: true } })
  let queued = 0
  for (const w of workspaces) {
    const today = await prisma.agentRun.count({ where: { workspaceId: w.id, agentId: "researcher", requestedById: null, createdAt: { gte: since }, input: { path: ["job"], equals: "geo" } } })
    let room = GEO_DAILY_MAX - today
    if (room <= 0) continue
    // Good targets of a campaign (Jev's verdict or a person's), with a site, a trade and a city, not probed this month.
    const companies = await prisma.company.findMany({
      where: {
        workspaceId: w.id,
        legalState: "ACTIVE",
        domain: { not: null },
        sector: { not: null },
        city: { not: null },
        OR: [{ geoCheckedAt: null }, { geoCheckedAt: { lt: stale } }],
        leads: { some: { status: { notIn: ["DISQUALIFIED", "DO_NOT_CONTACT"] }, relevances: { some: { OR: [{ decision: "RELEVANT" }, { decision: null, verdict: "RELEVANT" }] } } } },
      },
      select: { id: true, leads: { where: { status: { notIn: ["DISQUALIFIED", "DO_NOT_CONTACT"] } }, select: { id: true }, orderBy: { updatedAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
      take: room,
    })
    for (const c of companies) {
      const leadId = c.leads[0]?.id
      if (!leadId || room <= 0) continue
      // Claimed before it runs, for GEO_LEASE_DAYS: the next hours do not queue it again. A probe that runs to its end
      // dates its own finding (geo.ts), and the company then waits a month.
      const lease = new Date(stale.getTime() + GEO_LEASE_DAYS * DAY)
      const claimed = await prisma.company.updateMany({ where: { id: c.id, OR: [{ geoCheckedAt: null }, { geoCheckedAt: { lt: stale } }] }, data: { geoCheckedAt: lease } })
      if (!claimed.count) continue
      try {
        await startSystemRun(w.id, { agentId: "researcher", leadId, status: "QUEUED", priority: -1, input: { job: "geo" }, capMicros: GEO_CAP_MICROS })
        queued++
        room--
      } catch (error) {
        await prisma.company.update({ where: { id: c.id }, data: { geoCheckedAt: null } })
        console.warn("[RESEARCH] GEO probe not queued", c.id, error instanceof Error ? error.message : error)
        if (!isConflict(error)) break
      }
    }
  }
  return queued
}

/** The hourly pass. Never throws: the reminders it runs beside must go out whatever happens here. */
export async function queueResearch(now = new Date()): Promise<{ briefs: number; geo: number } | { skipped: string }> {
  if (!aiConfigured()) return { skipped: "IA non configurée" }
  try {
    return { briefs: await queueMeetingBriefs(now), geo: await queueGeoProbes(now) }
  } catch (error) {
    console.error("[RESEARCH] scheduling failed", error)
    return { skipped: error instanceof Error ? error.message : "erreur" }
  }
}
