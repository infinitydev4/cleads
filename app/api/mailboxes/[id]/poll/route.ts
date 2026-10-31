import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { rateLimit } from "@/lib/rate-limit"
import { getMailbox } from "@/features/outreach/mailboxes"
import { pollMailbox } from "@/features/outreach/poll"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** "Vérifier maintenant": reads this mailbox's new mail without waiting for the scheduled run. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("mailbox:manage")
    const { id } = await params
    await getMailbox(user, id)
    if (!(await rateLimit("mailbox-poll", user.id, 30, 3600))) return NextResponse.json({ error: "Trop de lectures : réessayez plus tard.", code: "rate_limited" }, { status: 429 })
    const summary = await pollMailbox(id)
    return NextResponse.json({ summary, mailbox: await getMailbox(user, id) })
  } catch (error) {
    return handleError(error)
  }
}
