import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { strategyBriefSchema } from "@/features/strategy/schemas"
import { requestStrategy, strategyState } from "@/features/strategy/service"

export const dynamic = "force-dynamic"

/** The Stratège's latest proposals, and whether the person may ask again (E25). */
export async function GET() {
  try {
    const { user } = await requirePermission("campaign:read")
    return NextResponse.json(await strategyState(user))
  } catch (error) {
    return handleError(error)
  }
}

/** « Proposer des cibles » : the Stratège's run is queued for the worker, with the person's brief. */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("ai:console")
    const brief = strategyBriefSchema.parse((await request.json().catch(() => ({}))) ?? {})
    return NextResponse.json(await requestStrategy(user, brief), { status: 202 })
  } catch (error) {
    return handleError(error)
  }
}
