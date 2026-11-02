import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { getRunDetail } from "@/features/ai/runs"

export const dynamic = "force-dynamic"

/** A run with its steps and its result: its requester, a manager or the owner. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:read")
    return NextResponse.json(await getRunDetail(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}
