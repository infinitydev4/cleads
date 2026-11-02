import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { draftState } from "@/features/email-draft/service"

export const dynamic = "force-dynamic"

/** Where a draft stands: waiting, being written, ready (with the draft) or failed (with why). */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { user } = await requirePermission("ai:use")
    return NextResponse.json(await draftState(user, (await params).runId))
  } catch (error) {
    return handleError(error)
  }
}
