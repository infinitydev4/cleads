import { registerTool } from "@/features/ai/tools"
import type { HandlerContext } from "@/features/ai/handlers"
import { MISSION_ACTIONS } from "./actions"

export { MISSION_ACTION } from "./engine"

/**
 * The worker's side of a mission's action that waited for its own click (E28): the worker executes approved calls by
 * name, so it must know the missions' actions; the call itself runs before this handler, exactly as approved, and its
 * result becomes the run's output, which the mission reads.
 */
export function registerMissionTools(): void {
  for (const a of Object.values(MISSION_ACTIONS)) registerTool(a.def)
}

export async function runMissionAction(job: HandlerContext): Promise<{ output: unknown }> {
  return { output: job.approved.at(-1)?.output ?? null }
}
