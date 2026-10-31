import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { REPLY_CLASSES, updateReply } from "@/features/outreach/replies"

export const dynamic = "force-dynamic"

const patchSchema = z.object({ replyClass: z.enum(REPLY_CLASSES).nullable().optional(), read: z.boolean().optional() }).strict()

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("email:send")
    const patch = patchSchema.parse(await request.json())
    await updateReply(user, (await params).id, patch, request.headers.get("x-forwarded-for"))
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleError(error)
  }
}
