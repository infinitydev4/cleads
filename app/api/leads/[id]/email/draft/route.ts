import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { requestFirstDraft } from "@/features/email-draft/service"

export const dynamic = "force-dynamic"

/** Asks the Rédacteur for a first email to the fiche, from its audit; follow it with GET /api/ai/drafts/[runId]. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:use")
    return NextResponse.json(await requestFirstDraft(user, (await params).id), { status: 202 })
  } catch (error) {
    return handleError(error)
  }
}
