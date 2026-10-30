import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { bookMeetingSchema } from "@/features/meetings/rules"
import { bookMeeting, listMeetings, listToClose } from "@/features/meetings/service"

export const dynamic = "force-dynamic"

/** `?from=&to=` (ISO instants) for the agenda, `?toClose=1` for the meetings still owed a result. */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("meeting:read")
    const q = new URL(request.url).searchParams
    if (q.get("toClose")) return NextResponse.json({ meetings: await listToClose(user) })
    const from = q.get("from")
    const to = q.get("to")
    if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return NextResponse.json({ error: "Période invalide." }, { status: 400 })
    if (Date.parse(to) - Date.parse(from) > 62 * 86_400_000) return NextResponse.json({ error: "Période trop longue (62 jours au plus)." }, { status: 400 })
    return NextResponse.json({ meetings: await listMeetings(user, { from, to, hostId: q.get("hostId") || undefined }) })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("meeting:book")
    return NextResponse.json({ meeting: await bookMeeting(user, bookMeetingSchema.parse(await request.json()), clientIp(request.headers)) }, { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
