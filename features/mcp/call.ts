import type { McpCallOutcome } from "@prisma/client"
import { ZodError } from "zod"
import { prisma } from "@/lib/prisma"
import { withActing } from "@/lib/ai/acting"
import { ExtractorError } from "@/lib/extractor/client"
import { LeadError } from "@/features/leads/errors"
import type { AgentPolicy } from "@/features/ai/actions/policy"
import { approvalOf, checkRight, type ToolContext } from "@/features/ai/tools"
import { MCP_AGENT } from "./names"
import { requestMcpApproval } from "./approvals"
import { forClient, refusalOf, toolByName } from "./tools"
import type { McpCaller } from "./tokens"

/**
 * One `tools/call` of an MCP client (E29): the catalogue's action, as the token's member. A call the token may not make
 * is refused with the reason; what needs no click runs at once and says "via <client> (MCP)" in the journal; what needs
 * one waits in « À valider » (D37). Every call is kept in the token's activity.
 */

export interface CallToolResult {
  content: { type: "text"; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/**
 * The context an MCP call runs in: the token's member and the MCP clients' row. There is no run until a person must
 * approve something (a run's id is only read by the tools that wait, which create their own).
 */
export function mcpContext(caller: McpCaller, policy: AgentPolicy, client: string): ToolContext {
  return { run: { id: "", workspaceId: caller.user.workspaceId, agentId: "copilot", requester: caller.user, userKey: caller.user.id, leadId: null, client }, policy }
}

const MAX_TEXT = 200_000

function result(value: unknown, isError = false): CallToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  const fits = text.length <= MAX_TEXT
  // An object also goes as structured content; older clients read the same JSON as text.
  const structured = !isError && fits && !!value && typeof value === "object" && !Array.isArray(value)
  return { content: [{ type: "text", text: fits ? text : `${text.slice(0, MAX_TEXT)}…` }], ...(structured ? { structuredContent: value as Record<string, unknown> } : {}), ...(isError ? { isError: true } : {}) }
}

const issues = (error: ZodError) =>
  error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "entrée"} : ${i.message}`)
    .join(" ; ")

/** A failure as the client's model reads it, to correct itself: the CRM's own words, never an internal error. */
function failure(error: unknown): { outcome: McpCallOutcome; message: string } {
  if (error instanceof LeadError) return { outcome: error.status === 429 || error.status === 503 ? "ERROR" : "REFUSED", message: error.message }
  if (error instanceof ZodError) return { outcome: "REFUSED", message: `Entrée invalide : ${issues(error)}` }
  if (error instanceof ExtractorError) return { outcome: "ERROR", message: error.message }
  console.error("[MCP] tool failed", error)
  return { outcome: "ERROR", message: "L'action a échoué de notre côté. Vérifie dans Cleads avant de la refaire." }
}

async function record(caller: McpCaller, call: { tool: string; client: string; outcome: McpCallOutcome; approvalId: string | null; durationMs: number }): Promise<void> {
  try {
    await prisma.mcpCall.create({ data: { workspaceId: caller.user.workspaceId, tokenId: caller.token.id, ...call } })
    // Housekeeping on a fraction of calls: activity older than 90 days is never shown.
    if (Math.random() < 0.01) await prisma.mcpCall.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } })
  } catch (error) {
    console.warn("[MCP] call not recorded", error instanceof Error ? error.message : error)
  }
}

/** Calls a tool for the token's member. Null for a name the catalogue does not know (a protocol error, not a refusal). */
export async function callTool(caller: McpCaller, policy: AgentPolicy, name: string, args: unknown, client: string): Promise<CallToolResult | null> {
  const def = toolByName(name)
  if (!def) return null
  const started = Date.now()
  const ctx = mcpContext(caller, policy, client)
  let outcome: McpCallOutcome = "DONE"
  let approvalId: string | null = null
  try {
    const refusal = refusalOf(def, { role: caller.user.role, readOnly: caller.token.readOnly, policy })
    if (refusal) {
      outcome = "REFUSED"
      return result(refusal, true)
    }
    const parsed = def.input.safeParse(args ?? {})
    if (!parsed.success) {
      outcome = "REFUSED"
      return result(`Entrée invalide : ${issues(parsed.error)}`, true)
    }
    checkRight(def, ctx)
    if (approvalOf(def, ctx) !== "auto") {
      const pending = await requestMcpApproval(ctx, def, parsed.data, { tokenId: caller.token.id, client })
      outcome = "PENDING"
      approvalId = pending.approvalId
      return result(pending)
    }
    const output = await withActing({ agentId: MCP_AGENT, tool: def.name, client }, () => def.execute(ctx, parsed.data))
    return result(forClient(def, output))
  } catch (error) {
    const f = failure(error)
    outcome = f.outcome
    return result(f.message, true)
  } finally {
    await record(caller, { tool: def.name, client, outcome, approvalId, durationMs: Date.now() - started })
  }
}
