import { prisma } from "@/lib/prisma"

/**
 * What wakes a mission (E28, features/missions/engine.ts): the end of a search one of its steps waits for, the end of
 * one of its runs, a person's decision. The worker looks at a mission again once its `wakeAt` has passed; a reading
 * every minute catches anything these calls miss. Never throws: a missed wake only delays the mission by a minute.
 */
export async function wakeMissions(where: { searchId?: string; missionId?: string }, now = new Date()): Promise<void> {
  try {
    if (where.missionId) await prisma.agentMission.updateMany({ where: { id: where.missionId, status: "RUNNING" }, data: { wakeAt: now } })
    if (where.searchId) await prisma.agentMission.updateMany({ where: { status: "RUNNING", steps: { some: { waitKind: "search", waitId: where.searchId, status: "WAITING" } } }, data: { wakeAt: now } })
  } catch (error) {
    console.warn("[MISSIONS] wake failed", error instanceof Error ? error.message : error)
  }
}

/** A run ended, or a person decided on its approval: the mission it works for, if any, looks again. */
export async function wakeMissionOfRun(runId: string, now = new Date()): Promise<void> {
  try {
    await prisma.agentMission.updateMany({ where: { status: "RUNNING", runs: { some: { id: runId } } }, data: { wakeAt: now } })
  } catch (error) {
    console.warn("[MISSIONS] wake failed", error instanceof Error ? error.message : error)
  }
}
