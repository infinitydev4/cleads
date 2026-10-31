import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { rateLimit } from "@/lib/rate-limit"
import { sendTestEmail } from "@/features/outreach/service"

export const dynamic = "force-dynamic"

/** Sends a real message from the mailbox to the signed-in person, footer and headers included. Uses one slot of the day. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("email:send")
    if (!(await rateLimit("mailbox-test-email", user.id, 5, 3600))) return NextResponse.json({ error: "Trop de tests : réessayez plus tard.", code: "rate_limited" }, { status: 429 })
    return NextResponse.json(await sendTestEmail(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}
