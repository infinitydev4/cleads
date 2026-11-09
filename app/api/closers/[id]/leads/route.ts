import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { closerLeads } from "@/features/lots/service"

export const dynamic = "force-dynamic"

/** A closer's fiches, for the managers. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("team:dispatch")
    return NextResponse.json({ rows: await closerLeads(user, (await params).id) })
  } catch (error) {
    return handleError(error)
  }
}
