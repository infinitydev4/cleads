import { NextResponse } from "next/server"
import { AuthError, getCurrentUser } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { parsePeriod } from "@/features/metrics/definitions"
import { getZone } from "@/features/hq/service"
import { isZoneId } from "@/features/hq/zones"

export const dynamic = "force-dynamic"

/** One space in detail. A module the role cannot open answers `locked` rather than 403, so the panel can say why. */
export async function GET(request: Request, { params }: { params: Promise<{ zone: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new AuthError(401)
    const zone = (await params).zone
    if (!isZoneId(zone)) return NextResponse.json({ error: "Espace inconnu" }, { status: 404 })
    return NextResponse.json(await getZone(user, zone, parsePeriod(new URL(request.url).searchParams.get("days"))))
  } catch (error) {
    return handleError(error)
  }
}
