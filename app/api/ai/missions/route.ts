import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { listMissions, listSchedules } from "@/features/missions/service"

export const dynamic = "force-dynamic"

/** The missions and recurring missions the person may see: theirs, or the team's for owners and managers (E28). */
export async function GET() {
  try {
    const { user } = await requirePermission("ai:read")
    const [missions, schedules] = await Promise.all([listMissions(user), listSchedules(user)])
    return NextResponse.json({ missions, schedules })
  } catch (error) {
    return handleError(error)
  }
}
