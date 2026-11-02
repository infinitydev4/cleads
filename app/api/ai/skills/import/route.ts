import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { ensureAgentCatalog } from "@/features/ai/catalog"
import { importSkillSchema } from "@/features/ai/skills/schemas"
import { importSkill } from "@/features/ai/skills/service"

export const dynamic = "force-dynamic"

/** A SKILL.md and the text files of its folder (read from a .md or a .zip by the browser). */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("skill:manage")
    await ensureAgentCatalog(user.workspaceId)
    const result = await importSkill(user, importSkillSchema.parse(await request.json()), clientIp(request.headers))
    return NextResponse.json(result, { status: result.created ? 201 : 200 })
  } catch (error) {
    return handleError(error)
  }
}
