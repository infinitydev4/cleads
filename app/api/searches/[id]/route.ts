import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { cancelSearch, refreshSearch } from "@/features/search/service"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { user } = await requirePermission("search:run")
    return NextResponse.json(await refreshSearch(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { user } = await requirePermission("search:run")
    return NextResponse.json(await cancelSearch(user, (await params).id, clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
