import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { updateDeal, updateDealSchema } from "@/features/pipeline/service"

/** Moves a card, edits its amount or date, hands it over. The rules per role are checked here, not in the browser. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("deal:read") // the service narrows to what the role may move
    return NextResponse.json(await updateDeal(user, (await params).id, updateDealSchema.parse(await request.json()), clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
