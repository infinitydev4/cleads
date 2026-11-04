import { handleRevoke } from "@/features/mcp/oauth/http"

export const dynamic = "force-dynamic"

/** E29 lot 2: token revocation (RFC 7009); a connection's token closes the connection. */
export const POST = handleRevoke
export const OPTIONS = handleRevoke
