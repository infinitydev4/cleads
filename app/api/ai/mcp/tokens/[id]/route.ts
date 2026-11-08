import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { revokeToken } from "@/features/mcp/tokens"

export const dynamic = "force-dynamic"

/** Revokes a token at once: its member, or the owner for anyone's. What it left in « À valider » is refused with it. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:console")
    return NextResponse.json(await revokeToken(user, (await params).id, clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
