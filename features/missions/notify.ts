import type { AgentMission } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { publishMissionUpdate, publishNotifications } from "@/lib/ai/realtime"

/**
 * What a mission tells people (E28): a notification in the bell of the person it acts for (and of the owners and
 * managers when it lost a right), and a live update for its card. Never throws: a missed notice is still in the
 * mission's card and in Agents IA › Missions.
 */
export async function notifyMission(
  m: Pick<AgentMission, "id" | "workspaceId" | "requestedById">,
  note: { title: string; message: string },
  opts: { managers?: boolean } = {}
): Promise<void> {
  try {
    const managers = opts.managers ? await prisma.user.findMany({ where: { workspaceId: m.workspaceId, active: true, role: { in: ["OWNER", "MANAGER"] } }, select: { id: true } }) : []
    const to = [...new Set([...(m.requestedById ? [m.requestedById] : []), ...managers.map((u) => u.id)])]
    if (!to.length) return
    const notes = await prisma.notification.createManyAndReturn({ data: to.map((userId) => ({ userId, type: "SYSTEM", title: note.title, message: note.message.slice(0, 500) })) })
    await publishNotifications(notes)
  } catch (error) {
    console.warn("[MISSIONS] notification failed", error instanceof Error ? error.message : error)
  }
}

export async function publishMission(missionId: string): Promise<void> {
  const m = await prisma.agentMission.findUnique({ where: { id: missionId }, select: { id: true, status: true, requestedById: true } }).catch(() => null)
  if (m) await publishMissionUpdate(m)
}
