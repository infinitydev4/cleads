import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { listTimeline } from "@/features/leads/service"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("lead:read")
    const url = new URL(request.url)
    const kinds = url.searchParams.get("kind")?.split(",").filter(Boolean)
    return NextResponse.json(await listTimeline(user, (await params).id, { kinds, before: url.searchParams.get("before") ?? undefined }))
  } catch (error) {
    return handleError(error)
  }
}
