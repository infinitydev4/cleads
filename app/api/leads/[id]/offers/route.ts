import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { startPitchSchema } from "@/features/offer-pitch/schemas"
import { getLeadPitch, requestPitch } from "@/features/offer-pitch/service"

export const dynamic = "force-dynamic"

/** The fiche's suggested offers: the latest pitch, the candidates of its audit, the pitch in progress if any. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:use")
    return NextResponse.json(await getLeadPitch(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

/** Starts the Conseiller offres on the fiche's audit. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:use")
    startPitchSchema.parse((await request.json().catch(() => ({}))) ?? {})
    return NextResponse.json(await requestPitch(user, (await params).id), { status: 202 })
  } catch (error) {
    return handleError(error)
  }
}
