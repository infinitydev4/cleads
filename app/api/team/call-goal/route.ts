import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { audit } from "@/lib/audit"
import { CALL_GOAL_LIMITS, setDailyCallGoal } from "@/features/leads/desk"

const schema = z.object({ goal: z.number().int("Un nombre entier d’appels").min(CALL_GOAL_LIMITS.min, "Au moins 1 appel").max(CALL_GOAL_LIMITS.max, `Au plus ${CALL_GOAL_LIMITS.max} appels`) })

/** The closers' daily call goal (the ring of « Ma journée »), for owners and managers. */
export async function PATCH(request: Request) {
  try {
    const { user } = await requirePermission("team:dispatch")
    const { goal } = schema.parse(await request.json())
    const saved = await setDailyCallGoal(user.workspaceId, goal)
    await audit({ action: "team.call_goal_changed", actorId: user.id, workspaceId: user.workspaceId, entityType: "Workspace", entityId: user.workspaceId, metadata: { goal: saved } })
    return NextResponse.json({ goal: saved })
  } catch (error) {
    return handleError(error)
  }
}
