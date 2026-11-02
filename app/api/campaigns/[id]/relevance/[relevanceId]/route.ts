import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { VERDICTS } from "@/features/relevance/rules"
import { decideRelevance } from "@/features/relevance/service"

export const dynamic = "force-dynamic"

const decisionSchema = z.object({ decision: z.enum(VERDICTS) })

/** A person decides for a fiche Jev was not sure about (or got wrong). */
export async function PATCH(request: Request, { params }: { params: Promise<{ relevanceId: string }> }) {
  try {
    const { user } = await requirePermission("ai:use")
    const { decision } = decisionSchema.parse(await request.json())
    await decideRelevance(user, (await params).relevanceId, decision, clientIp(request.headers))
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleError(error)
  }
}
