/**
 * The names the CRM's MCP server (E29, docs/crm-v1/AGENTS-IA.md §9) shares with the AI layer. No imports: the runs,
 * the approvals and the journal read them without loading the server.
 */

/** The task of a short run that holds an MCP client's action until a person approves it in « À valider » (D37). */
export const MCP_ACTION = "mcp_action"

/** What `via` names when an MCP client did an action for a person (lib/ai/acting.ts), and the matrix row's id (D38). */
export const MCP_AGENT = "mcp"

export const MCP_LABEL = "Clients MCP"

/** A token's expiry choices, in days (features/mcp/tokens.ts): there is no token without an end. */
export const TOKEN_DAYS = [30, 90, 365] as const

/** What a client calls itself (`clientInfo`), kept short and printable: for display, never a proof of who it is. */
export function clientName(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/[^\p{L}\p{N} ._()/+-]/gu, "").trim().slice(0, 40) : ""
  return name || "Client MCP"
}

/** The client of an MCP action's run, read back from its input. */
export function clientOfInput(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const v = input as Record<string, unknown>
  return v.kind === MCP_ACTION ? clientName(v.client) : null
}
