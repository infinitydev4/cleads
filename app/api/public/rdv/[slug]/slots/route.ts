import { NextResponse } from "next/server"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { isDayKey } from "@/lib/crm/day"
import { publicSlots } from "@/features/meetings/service"

export const dynamic = "force-dynamic"

/** `?from=YYYY-MM-DD&days=14` */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const q = new URL(request.url).searchParams
    const from = q.get("from") ?? ""
    if (!isDayKey(from)) return NextResponse.json({ error: "Date invalide." }, { status: 400 })
    return NextResponse.json(await publicSlots((await params).slug, from, Number(q.get("days") ?? 14) || 14, clientIp(request.headers)), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return handleError(error)
  }
}
