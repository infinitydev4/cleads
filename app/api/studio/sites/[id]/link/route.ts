import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { linkSchema } from "@/features/studio/schemas"
import { revokeLink, shareLink } from "@/features/studio/service"

export const dynamic = "force-dynamic"

/** Creates the share link (valid 30 days) or extends it by 30 days from now. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("studio:generate")
    const { action } = linkSchema.parse(await request.json())
    return NextResponse.json(await shareLink(user, (await params).id, action, clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}

/** The link stops working at once. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("studio:generate")
    await revokeLink(user, (await params).id, clientIp(request.headers))
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleError(error)
  }
}
