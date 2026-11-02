import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { updateBriefSchema } from "@/features/studio/schemas"
import { getSite, updateBrief } from "@/features/studio/service"

export const dynamic = "force-dynamic"

/** A site: its brief, its versions with their checks and scores, its link and visits, the run in progress. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("studio:generate")
    return NextResponse.json(await getSite(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

/** The brief as the person edited it. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("studio:generate")
    const { brief } = updateBriefSchema.parse(await request.json())
    return NextResponse.json(await updateBrief(user, (await params).id, brief, clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
