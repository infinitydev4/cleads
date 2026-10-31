import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { stopEnrollment } from "@/features/outreach/sequences"

export const dynamic = "force-dynamic"

/** Stops the automatic follow-ups for one fiche. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("sequence:manage")
    await stopEnrollment(user, (await params).id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleError(error)
  }
}
