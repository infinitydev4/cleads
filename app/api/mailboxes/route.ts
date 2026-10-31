import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { createMailboxSchema } from "@/features/outreach/schemas"
import { createMailbox, listMailboxes } from "@/features/outreach/mailboxes"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { user } = await requirePermission("mailbox:manage")
    return NextResponse.json({ mailboxes: await listMailboxes(user) })
  } catch (error) {
    return handleError(error)
  }
}

/** Adds a mailbox and tests its connection straight away: the answer says whether it can send. */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("mailbox:manage")
    return NextResponse.json(await createMailbox(user, createMailboxSchema.parse(await request.json()), clientIp(request.headers)), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
