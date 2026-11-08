import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { LeadError } from "@/features/leads/errors"
import { isAgentId } from "@/features/ai/agents"
import { updateAgentDefinition, updateAgentSchema } from "@/features/ai/definitions"

export const dynamic = "force-dynamic"

/** The workspace's layer over an agent: instructions and skills (skill:manage), model, limits and on/off (ai:manage). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:console")
    const { id } = await params
    if (!isAgentId(id)) throw new LeadError("not_found", "Agent inconnu", 404)
    return NextResponse.json(await updateAgentDefinition(user, id, updateAgentSchema.parse(await request.json()), clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
