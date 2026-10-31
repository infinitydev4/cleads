import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { rateLimit } from "@/lib/rate-limit"
import { clientIp } from "@/lib/request-ip"
import { sendSchema } from "@/features/outreach/schemas"
import { composeContext, sendToLead } from "@/features/outreach/service"

export const dynamic = "force-dynamic"

/** Everything the composer shows: recipient, what blocks the send, usable mailboxes with today's allowance, templates. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("email:send")
    return NextResponse.json(await composeContext(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("email:send")
    // Above any mailbox allowance: only a script or a stuck button gets here.
    if (!(await rateLimit("email-send", user.id, 120, 3600))) return NextResponse.json({ error: "Trop d’envois en une heure.", code: "rate_limited" }, { status: 429 })
    return NextResponse.json(await sendToLead(user, (await params).id, sendSchema.parse(await request.json()), clientIp(request.headers)), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
