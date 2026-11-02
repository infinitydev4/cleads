import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { reviseSchema } from "@/features/studio/schemas"
import { requestRevision } from "@/features/studio/service"

export const dynamic = "force-dynamic"

/** « Modifier par instruction » : a new version of the current one. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("studio:generate")
    const { instruction } = reviseSchema.parse(await request.json())
    return NextResponse.json(await requestRevision(user, (await params).id, instruction), { status: 202 })
  } catch (error) {
    return handleError(error)
  }
}
