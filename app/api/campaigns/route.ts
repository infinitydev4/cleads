import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { campaignOptions, createCampaign, listCampaigns } from "@/features/campaigns/service"
import { createCampaignSchema } from "@/features/campaigns/schemas"

export const dynamic = "force-dynamic"

/** `?options=1`: names only, for selectors; `?archived=1`: the archive. */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("campaign:read")
    const params = new URL(request.url).searchParams
    if (params.get("options") === "1") return NextResponse.json({ campaigns: await campaignOptions(user) })
    return NextResponse.json({ campaigns: await listCampaigns(user, { archived: params.get("archived") === "1" }) })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("campaign:manage")
    return NextResponse.json(await createCampaign(user, createCampaignSchema.parse(await request.json()), clientIp(request.headers)), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
