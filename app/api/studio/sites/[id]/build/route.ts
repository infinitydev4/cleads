import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { requestBuild } from "@/features/studio/service"

export const dynamic = "force-dynamic"

/** « Générer la maquette » : a version written from the brief. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("studio:generate")
    return NextResponse.json(await requestBuild(user, (await params).id), { status: 202 })
  } catch (error) {
    return handleError(error)
  }
}
