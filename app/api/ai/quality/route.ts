import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { PERIODS, qualityDashboard, type Period } from "@/features/quality/dashboard"

export const dynamic = "force-dynamic"

/** The quality dashboard of Agents IA (E27) over 7, 30 or 90 days: owners and managers. */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("ai:use")
    const days = Number(new URL(request.url).searchParams.get("days"))
    return NextResponse.json(await qualityDashboard(user, (PERIODS as readonly number[]).includes(days) ? (days as Period) : 30))
  } catch (error) {
    return handleError(error)
  }
}
