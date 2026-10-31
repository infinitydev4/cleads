import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { listEnrollments } from "@/features/outreach/sequences"

export const dynamic = "force-dynamic"

/** A fiche's sequence enrollments (current and past), for the fiche. */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("email:send")
    const lead = new URL(request.url).searchParams.get("lead")
    if (!lead) return NextResponse.json({ error: "Fiche manquante" }, { status: 400 })
    return NextResponse.json({ enrollments: await listEnrollments(user, { leadId: lead, take: 10 }) })
  } catch (error) {
    return handleError(error)
  }
}
