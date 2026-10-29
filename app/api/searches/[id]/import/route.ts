import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { importOptionsSchema } from "@/features/search/schemas"
import { importSearch } from "@/features/search/service"

export const maxDuration = 60

/** `commit: false` previews exactly what the import would do and writes nothing. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("lead:import")
    const options = importOptionsSchema.parse(await request.json().catch(() => ({})))
    return NextResponse.json(await importSearch(user, (await params).id, options, clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
