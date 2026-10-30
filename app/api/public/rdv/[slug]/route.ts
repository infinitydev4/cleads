import { NextResponse } from "next/server"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { publicBookingSchema } from "@/features/meetings/rules"
import { isValidTimezone } from "@/features/meetings/slots"
import { bookPublic, publicProfile } from "@/features/meetings/service"

export const dynamic = "force-dynamic"
const noStore = { "Cache-Control": "no-store" }

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    return NextResponse.json(await publicProfile((await params).slug), { headers: noStore })
  } catch (error) {
    return handleError(error)
  }
}

/** A prospect books. No sign-in, no account: rate-limited by connection, with an invisible field for robots. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const body = await request.json()
    const input = publicBookingSchema.parse(body)
    const tz = typeof body?.timezone === "string" && isValidTimezone(body.timezone) ? body.timezone : undefined
    return NextResponse.json(await bookPublic((await params).slug, input, clientIp(request.headers), tz), { status: 201, headers: noStore })
  } catch (error) {
    return handleError(error)
  }
}
