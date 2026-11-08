import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { parsePeriod } from "@/features/metrics/definitions"
import { getOverview } from "@/features/hq/service"

export const dynamic = "force-dynamic"

/** Everything the 3D view shows at once. Owners and managers (hq:view); each figure is limited to what their role sees. */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("hq:view")
    return NextResponse.json(await getOverview(user, parsePeriod(new URL(request.url).searchParams.get("days"))))
  } catch (error) {
    return handleError(error)
  }
}
