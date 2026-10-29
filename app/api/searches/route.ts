import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { startSearchSchema } from "@/features/search/schemas"
import { listSearches, startSearch } from "@/features/search/service"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { user } = await requirePermission("search:run")
    return NextResponse.json(await listSearches(user))
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("search:run")
    return NextResponse.json(await startSearch(user, startSearchSchema.parse(await request.json()), clientIp(request.headers)), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
