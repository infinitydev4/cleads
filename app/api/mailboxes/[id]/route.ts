import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { updateMailboxSchema } from "@/features/outreach/schemas"
import { deleteMailbox, updateMailbox } from "@/features/outreach/mailboxes"

export const dynamic = "force-dynamic"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("mailbox:manage")
    return NextResponse.json(await updateMailbox(user, (await params).id, updateMailboxSchema.parse(await request.json()), clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("mailbox:manage")
    await deleteMailbox(user, (await params).id, clientIp(request.headers))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleError(error)
  }
}
