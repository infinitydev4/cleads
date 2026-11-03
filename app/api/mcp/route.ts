import { handleMcp } from "@/features/mcp/server"

export const dynamic = "force-dynamic"

/**
 * The CRM's MCP server (E29, docs/crm-v1/AGENTS-IA.md §9): Claude Code, Cursor or a bridge to Claude Desktop call the
 * catalogue of actions here with a member's token. Outside `proxy.ts`: the token is the session.
 */
export async function POST(request: Request) {
  return handleMcp(request)
}

/** No stream to open and no session to end: the server answers 405 to both. */
export async function GET(request: Request) {
  return handleMcp(request)
}

export async function DELETE(request: Request) {
  return handleMcp(request)
}
