import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { publishVersion } from "@/features/studio/service"

export const dynamic = "force-dynamic"

/** Puts this version back online: the shared link shows it from now on. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; number: string }> }) {
  try {
    const { user } = await requirePermission("studio:generate")
    const { id, number } = await params
    const n = Number(number)
    if (!Number.isInteger(n) || n < 1) return NextResponse.json({ error: "Version invalide" }, { status: 400 })
    await publishVersion(user, id, n, clientIp(request.headers))
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleError(error)
  }
}
