import { handleResourceMetadata } from "@/features/mcp/oauth/http"

export const dynamic = "force-dynamic"

/** E29 lot 2: the MCP server's protected resource metadata (RFC 9728), named by its 401 (`resource_metadata`). */
export const GET = handleResourceMetadata
export const OPTIONS = handleResourceMetadata
