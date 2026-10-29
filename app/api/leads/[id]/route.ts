import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { updateLeadSchema } from "@/features/leads/schemas"
import { deleteLead, getLead, updateLead } from "@/features/leads/service"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { user } = await requirePermission("lead:read")
    return NextResponse.json(await getLead(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { user } = await requirePermission("lead:read") // the service narrows to what the person may write
    const id = (await params).id
    await updateLead(user, id, updateLeadSchema.parse(await request.json()), clientIp(request.headers))
    return NextResponse.json(await getLead(user, id))
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { user } = await requirePermission("data:delete")
    await deleteLead(user, (await params).id, clientIp(request.headers))
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleError(error)
  }
}
