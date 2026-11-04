import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { campaignPeopleQuote, launchCampaignPeople } from "@/features/research/service"

export const dynamic = "force-dynamic"

/** The quote before searching the decision makers of a campaign's good targets (E30 lot 2). Nothing is spent. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("campaign:read")
    return NextResponse.json(await campaignPeopleQuote(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

/** Queues the search, fifty fiches at most, in runs of ten. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("campaign:read")
    return NextResponse.json(await launchCampaignPeople(user, (await params).id, clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
