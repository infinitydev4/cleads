import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { tokenCalls } from "@/features/mcp/tokens"

export const dynamic = "force-dynamic"

/** A token's last calls: which action, from which client, and how it ended. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:use")
    return NextResponse.json(await tokenCalls(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}
