import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { decideApproval } from "@/features/ai/approvals"

export const dynamic = "force-dynamic"

const decisionSchema = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(500).nullish() }).strict()

/** Approves or refuses an action an agent wants to take outside the CRM. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:read")
    const body = decisionSchema.parse(await request.json())
    return NextResponse.json(await decideApproval(user, (await params).id, { approve: body.decision === "approve", note: body.note }))
  } catch (error) {
    return handleError(error)
  }
}
