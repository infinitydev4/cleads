import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { deleteAllConversations, listConversations } from "@/features/copilot/conversations"

export const dynamic = "force-dynamic"

/** The person's conversations with the copilot, latest first (`?limit=`). Nobody else's: they are private. */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("ai:use")
    const limit = Number(new URL(request.url).searchParams.get("limit"))
    return NextResponse.json(await listConversations(user, Number.isInteger(limit) && limit > 0 ? { limit } : {}))
  } catch (error) {
    return handleError(error)
  }
}

/** « Tout effacer ». */
export async function DELETE() {
  try {
    const { user } = await requirePermission("ai:use")
    return NextResponse.json({ deleted: await deleteAllConversations(user) })
  } catch (error) {
    return handleError(error)
  }
}
