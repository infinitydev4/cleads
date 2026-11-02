import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { startStudioSchema } from "@/features/studio/schemas"
import { getLeadStudio, startStudio } from "@/features/studio/service"

export const dynamic = "force-dynamic"

/** The fiche's latest Studio site, and whether a new one can be started. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("studio:generate")
    return NextResponse.json(await getLeadStudio(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

/** « Générer une landing » : a new site, starting with the Designer's brief. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("studio:generate")
    startStudioSchema.parse((await request.json().catch(() => ({}))) ?? {})
    return NextResponse.json(await startStudio(user, (await params).id), { status: 202 })
  } catch (error) {
    return handleError(error)
  }
}
