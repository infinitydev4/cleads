import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { relevanceView, requestRelevance } from "@/features/relevance/service"

export const dynamic = "force-dynamic"

/** Jev's sorting of the campaign's fiches (E25). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("campaign:read")
    return NextResponse.json(await relevanceView(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

/** « Trier les fiches » : the fiches not judged yet, a batch at a time. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:use")
    return NextResponse.json(await requestRelevance(user, (await params).id), { status: 202 })
  } catch (error) {
    return handleError(error)
  }
}
