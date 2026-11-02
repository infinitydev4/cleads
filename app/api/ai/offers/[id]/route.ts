import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { updateOfferSchema } from "@/features/offers/schemas"
import { updateOffer } from "@/features/offers/service"

export const dynamic = "force-dynamic"

/** Edits an offer; `status: "ACTIVE"` validates it for the agents, `"ARCHIVED"` withdraws it. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("offer:manage")
    return NextResponse.json(await updateOffer(user, (await params).id, updateOfferSchema.parse(await request.json()), clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
