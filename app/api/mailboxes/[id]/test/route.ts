import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { rateLimit } from "@/lib/rate-limit"
import { testMailbox } from "@/features/outreach/mailboxes"

export const dynamic = "force-dynamic"

/** Logs in to the mailbox (SMTP, then IMAP when set) without sending anything. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("mailbox:manage")
    if (!(await rateLimit("mailbox-test", user.id, 20, 3600))) return NextResponse.json({ error: "Trop de tests : réessayez plus tard.", code: "rate_limited" }, { status: 429 })
    return NextResponse.json(await testMailbox(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}
