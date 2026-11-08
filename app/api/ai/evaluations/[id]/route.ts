import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { evaluationDetail } from "@/features/quality/service"

export const dynamic = "force-dynamic"

/** One evaluation with its cases, while it runs and after. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:console")
    return NextResponse.json(await evaluationDetail(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}
