import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { ensureAgentCatalog } from "@/features/ai/catalog"
import { createOfferSchema } from "@/features/offers/schemas"
import { createOffer, listOffers } from "@/features/offers/service"

export const dynamic = "force-dynamic"

/** The offers catalogue; `?archived=1`: the archive. */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("ai:console")
    await ensureAgentCatalog(user.workspaceId)
    return NextResponse.json({ offers: await listOffers(user, { archived: new URL(request.url).searchParams.get("archived") === "1" }) })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("offer:manage")
    await ensureAgentCatalog(user.workspaceId)
    return NextResponse.json(await createOffer(user, createOfferSchema.parse(await request.json()), clientIp(request.headers)), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
