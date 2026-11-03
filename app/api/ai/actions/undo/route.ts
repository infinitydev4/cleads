import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { undoAction, undoSchema } from "@/features/copilot/undo"

export const dynamic = "force-dynamic"

/** E28: puts back what an action of the copilot did without a click (its card's « Annuler »). */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("ai:use")
    return NextResponse.json(await undoAction(user, undoSchema.parse(await request.json())))
  } catch (error) {
    return handleError(error)
  }
}
