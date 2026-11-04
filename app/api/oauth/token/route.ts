import { handleToken } from "@/features/mcp/oauth/http"

export const dynamic = "force-dynamic"

/** E29 lot 2: the token endpoint (codes and refresh tokens become access tokens to the MCP server). */
export const POST = handleToken
export const OPTIONS = handleToken
