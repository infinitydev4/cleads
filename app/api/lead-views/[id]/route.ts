import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { deleteView } from "@/features/leads/views"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("lead:read")
    await deleteView(user, (await params).id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleError(error)
  }
}
