import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { revokeInvitation } from "@/features/team/service"

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("team:manage")
    const { id } = await props.params
    await revokeInvitation(user, id, clientIp(request.headers))
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleError(error)
  }
}
