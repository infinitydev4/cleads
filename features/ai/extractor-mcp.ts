import { createMCPClient } from "@ai-sdk/mcp"
import type { Tool } from "ai"
import { can } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { recordStep } from "./runs"
import type { ToolContext } from "./tools"

/**
 * Cleads Extractor tools for agents, over MCP (D27, docs/crm-v1/AGENTS-IA.md §9). Read-only: launching or cancelling a
 * search goes through the CRM's search service, so every job is recorded with its campaign and journal. The worker
 * reaches the Extractor on the VPS's local network; elsewhere EXTRACTOR_URL + /mcp is used.
 */
export const EXTRACTOR_READ_TOOLS = ["list_sectors", "search_prospect_base", "get_business", "get_job", "get_job_results", "get_system_health"] as const

export function extractorMcpUrl(): string | null {
  if (process.env.EXTRACTOR_MCP_URL) return process.env.EXTRACTOR_MCP_URL
  const base = process.env.EXTRACTOR_URL
  return base ? `${base.replace(/\/+$/, "")}/mcp` : null
}

export interface ExtractorTools {
  tools: Record<string, Tool>
  close: () => Promise<void>
}

const NONE: ExtractorTools = { tools: {}, close: async () => undefined }

/** Every call is recorded as a step of the run, failures included. */
function recorded(name: string, tool: Tool, ctx: ToolContext): Tool {
  const execute = tool.execute
  if (!execute) return tool
  return {
    ...tool,
    execute: async (input, options) => {
      const started = Date.now()
      try {
        const output = await execute(input, options)
        await recordStep(ctx.run, { type: "TOOL", name: `extractor.${name}`, input, output, durationMs: Date.now() - started })
        return output
      } catch (error) {
        await recordStep(ctx.run, { type: "TOOL", name: `extractor.${name}`, input, output: { error: error instanceof Error ? error.message : String(error) }, durationMs: Date.now() - started })
        throw error
      }
    },
  } as Tool
}

/**
 * Opens a connection and returns the allowed tools; close it when the run is done. A person without the right to use
 * the Extractor (search:run), or a scheduled run, gets no tool.
 */
export async function openExtractorTools(ctx: ToolContext): Promise<ExtractorTools> {
  const requester = ctx.run.requester
  if (!requester || !can(requester.role, "search:run")) return NONE
  const url = extractorMcpUrl()
  const key = process.env.EXTRACTOR_API_KEY
  if (!url || !key) throw new LeadError("unavailable", "Cleads Extractor n'est pas configuré sur ce serveur.", 503)
  const client = await createMCPClient({ transport: { type: "http", url, headers: { Authorization: `Bearer ${key}` } } })
  try {
    const all = await client.tools()
    const tools: Record<string, Tool> = {}
    for (const name of EXTRACTOR_READ_TOOLS) if (all[name]) tools[name] = recorded(name, all[name] as Tool, ctx)
    return { tools, close: () => client.close() }
  } catch (error) {
    await client.close()
    throw error
  }
}
