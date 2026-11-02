import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { decideSchema } from "@/features/offer-pitch/schemas"
import { decideRecommendation } from "@/features/offer-pitch/service"

export const dynamic = "force-dynamic"

/** Keeps or sets aside a suggested offer, with the reason of a refusal; `SUGGESTED` undoes the decision. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; recommendationId: string }> }) {
  try {
    const { user } = await requirePermission("ai:use")
    const { id, recommendationId } = await params
    const input = decideSchema.parse(await request.json())
    return NextResponse.json(await decideRecommendation(user, id, recommendationId, input, clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
