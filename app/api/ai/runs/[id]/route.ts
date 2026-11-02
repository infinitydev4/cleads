import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { getRunDetail, runStatus } from "@/features/ai/runs"

export const dynamic = "force-dynamic"

/** A run with its steps and its result: its requester, a manager or the owner. `?view=status`: where it stands only. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:read")
    const id = (await params).id
    if (new URL(request.url).searchParams.get("view") === "status") return NextResponse.json(await runStatus(user, id))
    return NextResponse.json(await getRunDetail(user, id))
  } catch (error) {
    return handleError(error)
  }
}
