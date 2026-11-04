import { handleRegister } from "@/features/mcp/oauth/http"

export const dynamic = "force-dynamic"

/** E29 lot 2: Dynamic Client Registration (RFC 7591), for the MCP clients without a metadata document. */
export const POST = handleRegister
export const OPTIONS = handleRegister
