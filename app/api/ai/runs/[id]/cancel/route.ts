import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { cancelRun } from "@/features/ai/runs"

export const dynamic = "force-dynamic"

/** Stops a run in progress: its requester, a manager or the owner. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:read")
    await cancelRun(user, (await params).id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleError(error)
  }
}
