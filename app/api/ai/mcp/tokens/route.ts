import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { createToken, listTokens } from "@/features/mcp/tokens"

export const dynamic = "force-dynamic"

/** One's MCP tokens; `?team=1` gives the owner every member's. */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("ai:console")
    return NextResponse.json(await listTokens(user, { team: new URL(request.url).searchParams.get("team") === "1" }))
  } catch (error) {
    return handleError(error)
  }
}

/** A new token for the member who asks: the secret comes back once, in this answer only. */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("ai:console")
    return NextResponse.json(await createToken(user, await request.json(), clientIp(request.headers)), { status: 201, headers: { "cache-control": "no-store" } })
  } catch (error) {
    return handleError(error)
  }
}
