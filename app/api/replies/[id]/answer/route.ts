import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { answerSchema } from "@/features/outreach/schemas"
import { answerReply } from "@/features/outreach/service"

export const dynamic = "force-dynamic"

/** Answers a reply in its thread, from the mailbox that received it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("email:send")
    const input = answerSchema.parse(await request.json())
    return NextResponse.json(await answerReply(user, (await params).id, input, clientIp(request.headers)), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
