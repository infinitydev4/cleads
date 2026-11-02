import { tool, type Tool } from "ai"
import type { Prisma } from "@prisma/client"
import type { z } from "zod"
import { can, type Permission } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { requestApproval } from "./approvals"
import { recordStep, type RunContext } from "./runs"

/**
 * The tools agents may use (docs/crm-v1/AGENTS-IA.md §9). A tool calls an existing service and never the database
 * directly; it states the right it needs, checked against the person the run acts for, and whether a person must
 * approve it first. A tool that acts outside the CRM always waits for approval.
 */
export type ApprovalPolicy = "auto" | "user"
export type CostClass = "free" | "metered" | "external"

/** Rights no agent may use, whatever it is asked. */
export const FORBIDDEN_FOR_AGENTS: readonly Permission[] = ["data:delete", "data:export", "lead:merge", "mailbox:manage", "team:manage", "admin:tools", "legacy:access", "ai:manage"]

export interface ToolContext {
  run: RunContext
}

export interface ToolDef<I, O> {
  /** snake_case, as the model sees it. */
  name: string
  /** For the model: what the tool does and when to use it. */
  description: string
  /** Right the requester must hold; null for tools that touch no CRM data (reading a public page). */
  permission: Permission | null
  approval: ApprovalPolicy
  costClass: CostClass
  input: z.ZodType<I>
  /** For the person who approves: what will happen, in one sentence. Required when approval is "user". */
  summarize?: (input: I) => string
  execute: (ctx: ToolContext, input: I) => Promise<O>
}

// Tools of different shapes live in one list, so the generic stays open.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDef = ToolDef<any, any>

const NAME = /^[a-z][a-z0-9_]{1,47}$/

/** Checks a tool's declaration once, at load. */
export function defineTool<I, O>(def: ToolDef<I, O>): Readonly<ToolDef<I, O>> {
  if (!NAME.test(def.name)) throw new Error(`Outil « ${def.name} » : nom en snake_case, 2 à 48 caractères`)
  if (!def.description.trim()) throw new Error(`Outil « ${def.name} » : description obligatoire`)
  if (def.permission && FORBIDDEN_FOR_AGENTS.includes(def.permission)) throw new Error(`Outil « ${def.name} » : le droit ${def.permission} est interdit aux agents`)
  if (def.costClass === "external" && def.approval !== "user") throw new Error(`Outil « ${def.name} » : une action hors du CRM passe toujours par une validation`)
  if (def.approval === "user" && !def.summarize) throw new Error(`Outil « ${def.name} » : un résumé est obligatoire pour la validation`)
  return Object.freeze(def)
}

export type ToolResult<O> = { status: "done"; output: O } | { status: "pending_approval"; approvalId: string }

/**
 * Runs a tool for a run: validates the input, checks the requester's right, then either asks a person or executes;
 * the step is recorded either way, failures included.
 */
export async function runTool<I, O>(def: ToolDef<I, O>, ctx: ToolContext, rawInput: unknown): Promise<ToolResult<O>> {
  const input = def.input.parse(rawInput)
  if (def.permission) {
    const requester = ctx.run.requester
    if (!requester || !can(requester.role, def.permission)) {
      throw new LeadError("forbidden", `L'outil « ${def.name} » demande un droit que la personne pour qui l'IA travaille n'a pas.`, 403)
    }
  }
  if (def.approval === "user") {
    const approvalId = await requestApproval(ctx.run, { tool: def.name, permission: def.permission, payload: input as Prisma.InputJsonValue, summary: def.summarize!(input) })
    return { status: "pending_approval", approvalId }
  }
  const started = Date.now()
  try {
    const output = await def.execute(ctx, input)
    await recordStep(ctx.run, { type: "TOOL", name: def.name, input, output, durationMs: Date.now() - started })
    return { status: "done", output }
  } catch (error) {
    await recordStep(ctx.run, { type: "TOOL", name: def.name, input, output: { error: error instanceof Error ? error.message : String(error) }, durationMs: Date.now() - started })
    throw error
  }
}

/** The answer an agent receives when its call waits for a person: it must not assume the action happened. */
export const PENDING_APPROVAL_ANSWER = { pendingApproval: true, message: "Action soumise à la validation d'une personne : elle n'est pas faite. Ne la considère pas comme réalisée." }

/** The same tools for an AI SDK agent (ToolLoopAgent, generateText). */
export function sdkTools(defs: readonly AnyToolDef[], ctx: ToolContext): Record<string, Tool> {
  return Object.fromEntries(
    defs.map((def) => [
      def.name,
      tool({
        description: def.description,
        inputSchema: def.input,
        execute: async (input: unknown) => {
          const result = await runTool(def, ctx, input)
          return result.status === "done" ? result.output : PENDING_APPROVAL_ANSWER
        },
      }),
    ])
  )
}
