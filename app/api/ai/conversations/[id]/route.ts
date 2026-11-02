import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { deleteConversation, getConversation } from "@/features/copilot/conversations"

export const dynamic = "force-dynamic"

/** One conversation with its messages, for the person it belongs to. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:use")
    return NextResponse.json(await getConversation(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:use")
    await deleteConversation(user, (await params).id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleError(error)
  }
}
