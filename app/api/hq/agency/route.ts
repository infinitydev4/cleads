import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { agencyPulse } from "@/features/hq/agency-service"

export const dynamic = "force-dynamic"

/** The AI agency of the 3D view alone (E26): what the view polls while agents work, between two full refreshes. */
export async function GET() {
  try {
    const { user } = await requirePermission("ai:use")
    return NextResponse.json(await agencyPulse(user))
  } catch (error) {
    return handleError(error)
  }
}
