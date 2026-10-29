import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { bulkSchema } from "@/features/leads/schemas"
import { bulkUpdate } from "@/features/leads/service"

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("lead:write")
    return NextResponse.json(await bulkUpdate(user, bulkSchema.parse(await request.json()), clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
