import { handleResourceMetadata } from "@/features/mcp/oauth/http"

export const dynamic = "force-dynamic"

/** RFC 9728 at the root: the clients that do not insert the MCP server's path find the same document here. */
export const GET = handleResourceMetadata
export const OPTIONS = handleResourceMetadata
