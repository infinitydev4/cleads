import { NextResponse } from "next/server"
import { z } from "zod"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { guestAct, guestMeeting } from "@/features/meetings/service"

export const dynamic = "force-dynamic"
const noStore = { "Cache-Control": "no-store" }

const actSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("reschedule"), startsAt: z.iso.datetime() }),
])

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    return NextResponse.json(await guestMeeting(decodeURIComponent((await params).token)), { headers: noStore })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    return NextResponse.json(await guestAct(decodeURIComponent((await params).token), actSchema.parse(await request.json()), clientIp(request.headers)), { headers: noStore })
  } catch (error) {
    return handleError(error)
  }
}
