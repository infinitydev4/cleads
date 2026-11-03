import { tool, type JSONValue, type Tool, type ToolApprovalStatus } from "ai"
import type { Prisma } from "@prisma/client"
import type { z } from "zod"
import { prisma } from "@/lib/prisma"
import { can, type Permission } from "@/lib/rbac"
import { forLog } from "@/lib/ai/untrusted"
import { withActing } from "@/lib/ai/acting"
import { LeadError } from "@/features/leads/errors"
import { requestApproval } from "./approvals"
import { recordStep, type RunContext } from "./runs"
import { AGENTS } from "./agents"
import { FAMILY_INFO, type ActionFamily } from "./actions/families"
import { effectivePolicy, modeOf, type AgentPolicy } from "./actions/policy"

/**
 * The tools agents may use (docs/crm-v1/AGENTS-IA.md §9). A tool calls an existing service and never the database
 * directly; it states the right it needs, checked against the person the run acts for, its family in the agents'
 * rights matrix (E28), and whether a person must approve it first. A tool that acts outside the CRM always waits for
 * approval.
 */
export type ApprovalPolicy = "auto" | "user"
export type CostClass = "free" | "metered" | "external"

/**
 * When a call runs (E28): without a click, after a click (the action's card, or the plan that contains it), or after
 * its own click whatever else was validated (what contacts a prospect).
 */
export type ApprovalLevel = "auto" | "confirm" | "explicit"

/** Rights no agent may use, whatever it is asked. */
export const FORBIDDEN_FOR_AGENTS: readonly Permission[] = [
  "data:delete",
  "data:export",
  "lead:merge",
  "mailbox:manage",
  "team:manage",
  "admin:tools",
  "legacy:access",
  "ai:manage",
  // An agent never rewrites its own instructions or the offers it recommends.
  "skill:manage",
  "offer:manage",
]

export interface ToolContext {
  run: RunContext
  /** The agent's rights matrix for this run (features/ai/definitions.ts); the code's when not given. */
  policy?: AgentPolicy
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
  /** Its family of actions; null only for a tool that touches no CRM data (reading a skill). */
  family: ActionFamily | null
  input: z.ZodType<I>
  /**
   * For the person who approves: what will happen, in one sentence. Required when approval is "user". It may read the
   * CRM (a fiche's name) and throw when the call cannot be made: the request is then refused before anyone is asked.
   */
  summarize?: (input: I, ctx: ToolContext) => string | Promise<string>
  execute: (ctx: ToolContext, input: I) => Promise<O>
  /** Puts back what a call without a click changed, from its output; offered on the call's card. */
  undo?: (ctx: ToolContext, output: O) => Promise<void>
  /** What the model reads of the output, when the output keeps more for the card (the fiches an undo puts back). */
  forModel?: (output: O) => unknown
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
  if (def.family === null && def.permission !== null) throw new Error(`Outil « ${def.name} » : un outil qui demande un droit appartient à une famille d'actions`)
  if (def.family && def.approval === "auto" && FAMILY_INFO[def.family].floor !== "auto") throw new Error(`Outil « ${def.name} » : la famille « ${def.family} » attend toujours un clic`)
  if (def.undo && def.approval !== "auto") throw new Error(`Outil « ${def.name} » : seule une action sans clic s'annule depuis sa carte`)
  return Object.freeze(def)
}

/** The level the tool itself asks for. */
export const levelOf = (def: Pick<AnyToolDef, "approval" | "costClass">): ApprovalLevel => (def.costClass === "external" ? "explicit" : def.approval === "user" ? "confirm" : "auto")

const policyOf = (ctx: ToolContext): AgentPolicy => ctx.policy ?? effectivePolicy(AGENTS[ctx.run.agentId], null)

/** The level a call runs at for this agent: the matrix can make a call wait for a click, never skip one. */
export function approvalOf(def: AnyToolDef, ctx: ToolContext): ApprovalLevel {
  const level = levelOf(def)
  return level === "auto" && def.family && modeOf(policyOf(ctx), def.family) === "confirm" ? "confirm" : level
}

/** Whether the agent may use the tool at all: a family it does not declare, or that the owner cut, is closed. */
export const isOpen = (def: Pick<AnyToolDef, "family">, policy: AgentPolicy) => !def.family || modeOf(policy, def.family) !== "off"

export type ToolResult<O> = { status: "done"; output: O } | { status: "pending_approval"; approvalId: string }

const registry = new Map<string, AnyToolDef>()

/** Makes a tool known to the worker, which executes approved calls by name. */
export function registerTool(def: AnyToolDef): void {
  const known = registry.get(def.name)
  if (known && known !== def) throw new Error(`Outil « ${def.name} » déjà enregistré`)
  registry.set(def.name, def)
}

export const getTool = (name: string) => registry.get(name)

/** Tests only. */
export function clearTools() {
  registry.clear()
}

/** The person's right, then the agent's matrix: checked when the call is offered, asked for and made. */
function checkRight(def: AnyToolDef, ctx: ToolContext) {
  if (def.family && !isOpen(def, policyOf(ctx))) {
    const label = AGENTS[ctx.run.agentId]?.label ?? "Cet agent"
    throw new LeadError("forbidden", `${label} n'a pas le droit « ${FAMILY_INFO[def.family].label} » dans cet espace : le propriétaire le règle dans Agents IA › Agents › Droits.`, 403)
  }
  if (!def.permission) return
  const requester = ctx.run.requester
  if (!requester || !can(requester.role, def.permission)) {
    throw new LeadError("forbidden", `L'outil « ${def.name} » demande un droit que la personne pour qui l'IA travaille n'a pas.`, 403)
  }
}

/** Executes a call and records it, failures included. The requester's right is checked again at this moment. */
async function executeTool<I, O>(def: ToolDef<I, O>, ctx: ToolContext, input: I): Promise<O> {
  checkRight(def, ctx)
  const started = Date.now()
  try {
    const output = await withActing({ agentId: ctx.run.agentId, runId: ctx.run.id, tool: def.name }, () => def.execute(ctx, input))
    await recordStep(ctx.run, { type: "TOOL", name: def.name, input, output, durationMs: Date.now() - started })
    return output
  } catch (error) {
    await recordStep(ctx.run, { type: "TOOL", name: def.name, input, output: { error: error instanceof Error ? error.message : String(error) }, durationMs: Date.now() - started })
    throw error
  }
}

/** Runs a tool for a run: validates the input, checks the requester's right, then either asks a person or executes. */
export async function runTool<I, O>(def: ToolDef<I, O>, ctx: ToolContext, rawInput: unknown): Promise<ToolResult<O>> {
  const input = def.input.parse(rawInput)
  checkRight(def, ctx)
  if (approvalOf(def, ctx) !== "auto") {
    const approvalId = await requestApproval(ctx.run, { tool: def.name, permission: def.permission, payload: input as Prisma.InputJsonValue, summary: def.summarize ? await def.summarize(input, ctx) : `Utiliser « ${def.name} ».` })
    return { status: "pending_approval", approvalId }
  }
  return { status: "done", output: await executeTool(def, ctx, input) }
}

export interface ApprovedCall {
  approvalId: string
  tool: string
  payload: unknown
  output: unknown
}

export interface ApprovedCalls {
  /** Executed, now or on an earlier try. */
  done: ApprovedCall[]
  /** Started on an earlier try that never finished: maybe done. Never executed again. */
  uncertain: { approvalId: string; tool: string }[]
  failed: { approvalId: string; tool: string; error: string }[]
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Executes the approved calls of a run exactly as they were approved, each at most once: the call is marked started
 * before it runs, so a worker that stops halfway leaves it "maybe done" instead of doing it twice.
 */
export async function executeApprovedCalls(ctx: ToolContext): Promise<ApprovedCalls> {
  const approvals = await prisma.agentApproval.findMany({
    where: { runId: ctx.run.id, status: "APPROVED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, tool: true, payload: true, executionStartedAt: true, executedAt: true, result: true },
  })
  const out: ApprovedCalls = { done: [], uncertain: [], failed: [] }
  for (const a of approvals) {
    const result = a.result as { output?: unknown; error?: string } | null
    if (a.executedAt) {
      if (result?.error) out.failed.push({ approvalId: a.id, tool: a.tool, error: result.error })
      else out.done.push({ approvalId: a.id, tool: a.tool, payload: a.payload, output: result?.output ?? null })
      continue
    }
    if (a.executionStartedAt) {
      out.uncertain.push({ approvalId: a.id, tool: a.tool })
      continue
    }
    const claimed = await prisma.agentApproval.updateMany({ where: { id: a.id, executionStartedAt: null }, data: { executionStartedAt: new Date() } })
    if (claimed.count !== 1) {
      out.uncertain.push({ approvalId: a.id, tool: a.tool })
      continue
    }
    const def = getTool(a.tool)
    try {
      if (!def) throw new Error(`Outil « ${a.tool} » inconnu de ce worker`)
      const output = await executeTool(def, ctx, def.input.parse(a.payload))
      await prisma.agentApproval.update({ where: { id: a.id }, data: { executedAt: new Date(), result: { output: forLog(output) } } })
      out.done.push({ approvalId: a.id, tool: a.tool, payload: a.payload, output })
    } catch (error) {
      await prisma.agentApproval.update({ where: { id: a.id }, data: { executedAt: new Date(), result: { error: errorText(error) } } })
      out.failed.push({ approvalId: a.id, tool: a.tool, error: errorText(error) })
    }
  }
  return out
}

/** The answer an agent receives when its call waits for a person: it must not assume the action happened. */
export const PENDING_APPROVAL_ANSWER = { pendingApproval: true, message: "Action soumise à la validation d'une personne : elle n'est pas faite. Ne la considère pas comme réalisée." }

/** The model reads `forModel(output)` instead of the whole output; the approval answer goes through as it is. */
function modelOutput(def: AnyToolDef): Pick<Tool, "toModelOutput"> {
  if (!def.forModel) return {}
  const forModel = def.forModel
  return { toModelOutput: ({ output }) => ({ type: "json", value: (output === PENDING_APPROVAL_ANSWER ? output : forModel(output)) as JSONValue }) }
}

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
        ...modelOutput(def),
      }),
    ])
  )
}

/**
 * The same tools for a conversation (the copilot, E24), where the person is present: a call that needs them waits for
 * their answer in the conversation itself, with what will happen in words, and runs in the next request once approved,
 * the requester's right checked again. A call that cannot be made (no right, a fiche they do not see) is refused before
 * anyone is asked, and the model is told why.
 */
export function chatTools(defs: readonly AnyToolDef[], ctx: ToolContext): { tools: Record<string, Tool>; toolApproval: Record<string, (input: unknown) => Promise<ToolApprovalStatus>> } {
  const tools: Record<string, Tool> = {}
  const toolApproval: Record<string, (input: unknown) => Promise<ToolApprovalStatus>> = {}
  for (const def of defs) {
    tools[def.name] = tool({
      description: def.description,
      inputSchema: def.input,
      execute: async (input: unknown) => executeTool(def, ctx, def.input.parse(input)),
      ...modelOutput(def),
    })
    if (approvalOf(def, ctx) === "auto") continue
    toolApproval[def.name] = async (input) => {
      try {
        checkRight(def, ctx)
        const summary = def.summarize ? await def.summarize(def.input.parse(input), ctx) : `Utiliser « ${def.name} ».`
        return { type: "user-approval", reason: summary.trim().slice(0, 500) }
      } catch (error) {
        return { type: "denied", reason: errorText(error).slice(0, 300) }
      }
    }
  }
  return { tools, toolApproval }
}
