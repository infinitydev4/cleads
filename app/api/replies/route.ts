import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { listReplies } from "@/features/outreach/replies"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("email:send")
    return NextResponse.json(await listReplies(user, { before: new URL(request.url).searchParams.get("before") ?? undefined }))
  } catch (error) {
    return handleError(error)
  }
}
