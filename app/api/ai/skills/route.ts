import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { ensureAgentCatalog } from "@/features/ai/catalog"
import { createSkillSchema } from "@/features/ai/skills/schemas"
import { createSkill, listSkills } from "@/features/ai/skills/service"

export const dynamic = "force-dynamic"

/** The skills of the workspace; `?archived=1`: the archive. */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("ai:use")
    await ensureAgentCatalog(user.workspaceId)
    return NextResponse.json({ skills: await listSkills(user, { archived: new URL(request.url).searchParams.get("archived") === "1" }) })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("skill:manage")
    await ensureAgentCatalog(user.workspaceId)
    return NextResponse.json(await createSkill(user, createSkillSchema.parse(await request.json()), clientIp(request.headers)), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
