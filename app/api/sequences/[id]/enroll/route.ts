import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { rateLimit } from "@/lib/rate-limit"
import { enrollLeads } from "@/features/outreach/sequences"
import { enrollSchema } from "@/features/outreach/schemas"

export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("sequence:manage")
    if (!(await rateLimit("sequence-enroll", user.id, 30, 3600))) return NextResponse.json({ error: "Trop d’inscriptions : réessayez plus tard.", code: "rate_limited" }, { status: 429 })
    return NextResponse.json(await enrollLeads(user, (await params).id, enrollSchema.parse(await request.json()), request.headers.get("x-forwarded-for")))
  } catch (error) {
    return handleError(error)
  }
}
