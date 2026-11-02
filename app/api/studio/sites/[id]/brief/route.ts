import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { retryBrief } from "@/features/studio/service"

export const dynamic = "force-dynamic"

/** The brief again, after a run that failed before writing it. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("studio:generate")
    return NextResponse.json(await retryBrief(user, (await params).id), { status: 202 })
  } catch (error) {
    return handleError(error)
  }
}
