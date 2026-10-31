import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { listEmails } from "@/features/outreach/service"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("email:send")
    const q = new URL(request.url).searchParams
    return NextResponse.json(await listEmails(user, { before: q.get("before") ?? undefined, mailboxId: q.get("mailbox") ?? undefined, leadId: q.get("lead") ?? undefined, direction: "OUTBOUND" }))
  } catch (error) {
    return handleError(error)
  }
}
