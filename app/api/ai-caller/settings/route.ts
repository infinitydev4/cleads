import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { can } from "@/lib/rbac"
import { AuthError } from "@/lib/auth/errors"
import { updateSettings } from "@/features/ai-caller/service"
import { settingsSchema } from "@/features/ai-caller/schemas"

/** E33: the owner configures the agent; a manager may only pause and resume it. */
export async function PATCH(request: Request) {
  try {
    const { user } = await requirePermission("aicall:manage")
    const patch = settingsSchema.parse(await request.json())
    const onlyPause = Object.keys(patch).every((k) => k === "paused")
    if (!onlyPause && !can(user.role, "aicall:configure")) throw new AuthError(403)
    return NextResponse.json(await updateSettings(user, patch))
  } catch (error) {
    return handleError(error)
  }
}
