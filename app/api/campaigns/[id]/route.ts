import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { getCampaign, updateCampaign } from "@/features/campaigns/service"
import { updateCampaignSchema } from "@/features/campaigns/schemas"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("campaign:read")
    return NextResponse.json(await getCampaign(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

/** Edits, status changes, archiving (`archived: true`) and restoring. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("campaign:manage")
    return NextResponse.json(await updateCampaign(user, (await params).id, updateCampaignSchema.parse(await request.json()), clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
