import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { createLeadSchema, parseLeadFilters } from "@/features/leads/schemas"
import { createLead, listLeads } from "@/features/leads/service"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("lead:read")
    const params = Object.fromEntries(new URL(request.url).searchParams)
    return NextResponse.json(await listLeads(user, parseLeadFilters(params)))
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("lead:write")
    const input = createLeadSchema.parse(await request.json())
    return NextResponse.json(await createLead(user, input, clientIp(request.headers)), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
