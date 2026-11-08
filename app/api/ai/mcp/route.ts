import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { mcpAccess, rightsView, updateMcpAccess, updateMcpSchema } from "@/features/mcp/policy"

export const dynamic = "force-dynamic"

/** MCP in this workspace (E29): on or off, and the MCP clients' rights matrix. */
export async function GET() {
  try {
    const { user } = await requirePermission("ai:console")
    return NextResponse.json(rightsView(await mcpAccess(user.workspaceId)))
  } catch (error) {
    return handleError(error)
  }
}

/** The owner switches MCP on or off (D39) and sets the MCP clients' row (D38). */
export async function PUT(request: Request) {
  try {
    const { user } = await requirePermission("ai:manage")
    return NextResponse.json(await updateMcpAccess(user, updateMcpSchema.parse(await request.json()), clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
