import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { updateSkillSchema } from "@/features/ai/skills/schemas"
import { getSkill, updateSkill } from "@/features/ai/skills/service"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:console")
    return NextResponse.json(await getSkill(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

/** A new version, archiving or restoring, or going back to an earlier version (`restoreVersion`). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("skill:manage")
    return NextResponse.json(await updateSkill(user, (await params).id, updateSkillSchema.parse(await request.json()), clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
