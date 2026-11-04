import { handleServerMetadata } from "@/features/mcp/oauth/http"

export const dynamic = "force-dynamic"

/** E29 lot 2: Cleads' authorization server metadata (RFC 8414), read by Claude, ChatGPT and Claude Code. */
export const GET = handleServerMetadata
export const OPTIONS = handleServerMetadata
