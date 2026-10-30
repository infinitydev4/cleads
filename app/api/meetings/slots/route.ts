import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { isDayKey } from "@/lib/crm/day"
import { listSlots } from "@/features/meetings/service"

export const dynamic = "force-dynamic"

/** Open slots of a host: `?hostId=&from=YYYY-MM-DD&days=7[&ignore=<meetingId>]`. */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("meeting:book")
    const q = new URL(request.url).searchParams
    const hostId = q.get("hostId")
    const from = q.get("from") ?? ""
    if (!hostId || !isDayKey(from)) return NextResponse.json({ error: "Closer ou date manquants." }, { status: 400 })
    return NextResponse.json(await listSlots(user, hostId, from, Number(q.get("days") ?? 7) || 7, { ignoreMeetingId: q.get("ignore") || undefined }))
  } catch (error) {
    return handleError(error)
  }
}
