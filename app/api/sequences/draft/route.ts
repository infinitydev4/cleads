import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { stepDraftRequestSchema } from "@/features/email-draft/schemas"
import { requestStepDraft } from "@/features/email-draft/service"

export const dynamic = "force-dynamic"

/** Asks the Rédacteur for a sequence step (a template with variables); follow it with GET /api/ai/drafts/[runId]. */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("sequence:manage")
    const input = stepDraftRequestSchema.parse(await request.json())
    return NextResponse.json(await requestStepDraft(user, input), { status: 202 })
  } catch (error) {
    return handleError(error)
  }
}
