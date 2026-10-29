import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { getLead } from "@/features/leads/service"
import { qualifyLead, qualifySchema } from "@/features/pipeline/service"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("lead:write")
    const id = (await params).id
    const { dealId } = await qualifyLead(user, id, qualifySchema.parse(await request.json()), clientIp(request.headers))
    return NextResponse.json({ dealId, lead: await getLead(user, id) })
  } catch (error) {
    return handleError(error)
  }
}
