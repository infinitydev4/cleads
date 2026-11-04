import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { decideCandidate, requestResearch, researchView } from "@/features/research/service"

export const dynamic = "force-dynamic"

/** The fiche's research card (E30 lot 2): decision makers, social accounts, GEO probe and meeting brief. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("lead:read")
    return NextResponse.json(await researchView(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("people") }),
  z.object({ action: z.literal("geo") }),
  z.object({ action: z.literal("brief"), meetingId: z.string().min(1).max(40).optional() }),
  z.object({ action: z.literal("confirm"), candidateId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("dismiss"), candidateId: z.string().min(1).max(40) }),
])

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("lead:read")
    const id = (await params).id
    const body = actionSchema.parse(await request.json())
    if (body.action === "confirm" || body.action === "dismiss") await decideCandidate(user, id, body.candidateId, body.action, clientIp(request.headers))
    else await requestResearch(user, id, body.action, body.action === "brief" ? { meetingId: body.meetingId } : {})
    return NextResponse.json(await researchView(user, id))
  } catch (error) {
    return handleError(error)
  }
}
