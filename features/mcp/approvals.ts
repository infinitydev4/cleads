import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { publishNotifications } from "@/lib/ai/realtime"
import { requestApproval } from "@/features/ai/approvals"
import { finishRun, loadRunContext, startRun } from "@/features/ai/runs"
import { executeApprovedCalls, type AnyToolDef, type ToolContext } from "@/features/ai/tools"
import { MCP_ACTION } from "./names"
import { mcpAccess } from "./policy"
import { approvalsLink } from "./status"
import { registerMcpTools } from "./tools"

/**
 * D37: what an MCP client asks for that needs a click waits in « À valider », as a mission's contact step does (E28). A
 * short run without a model holds the approval; the person approves in Cleads, and the action then runs here, exactly as
 * shown, at most once, with the person's rights and the MCP clients' row read again. No worker takes these runs.
 */

export interface PendingAction {
  pending: true
  approvalId: string
  summary: string
  expiresAt: string
  link: string
  note: string
}

const PENDING_NOTE = "Pas encore faite : elle attend la validation de la personne dans Cleads. Ne la présente pas comme faite ; get_action_status dit quand elle l'est."
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function notify(user: CurrentUser, client: string, summary: string): Promise<void> {
  try {
    const notes = await prisma.notification.createManyAndReturn({ data: [{ userId: user.id, type: "SYSTEM", title: `${client} attend votre validation`, message: summary.slice(0, 500) }] })
    await publishNotifications(notes)
  } catch (error) {
    // The request still waits in « À valider »: a missed notice loses nothing.
    console.warn("[MCP] notification failed", error instanceof Error ? error.message : error)
  }
}

/** Puts a call in « À valider ». Its summary may refuse it first (no right on the fiche): then nothing waits. */
export async function requestMcpApproval(ctx: ToolContext, def: AnyToolDef, input: unknown, origin: { tokenId: string; client: string }): Promise<PendingAction> {
  const user = ctx.run.requester!
  const summary = def.summarize ? await def.summarize(input, ctx) : `Utiliser « ${def.name} ».`
  const run = await startRun(user, { agentId: "copilot", status: "RUNNING", noModel: true, client: origin.client, input: { kind: MCP_ACTION, tool: def.name, tokenId: origin.tokenId, client: origin.client } })
  try {
    const approvalId = await requestApproval(run, { tool: def.name, permission: def.permission, payload: input as Prisma.InputJsonValue, summary })
    const a = await prisma.agentApproval.findUniqueOrThrow({ where: { id: approvalId }, select: { summary: true, expiresAt: true } })
    await notify(user, origin.client, a.summary)
    return { pending: true, approvalId, summary: a.summary, expiresAt: a.expiresAt.toISOString(), link: approvalsLink(), note: PENDING_NOTE }
  } catch (error) {
    await finishRun(run.id, { status: "FAILED", error: errorText(error) })
    throw error
  }
}

/** Why an approved MCP action must not run any more, or null. */
async function blocked(workspaceId: string, tokenId: unknown): Promise<string | null> {
  if (!(await mcpAccess(workspaceId)).enabled) return "L'accès MCP a été coupé dans cet espace : l'action n'a pas été faite."
  const token = typeof tokenId === "string" ? await prisma.mcpToken.findUnique({ where: { id: tokenId }, select: { revokedAt: true } }) : null
  if (!token || token.revokedAt) return "Le jeton MCP qui l'a demandée a été révoqué : l'action n'a pas été faite."
  return null
}

/**
 * Runs an approved MCP action (called by `decideApproval` once nothing else waits). The run is taken first, so two
 * approvals at once run it once; each call is marked started before it runs, so a stop halfway leaves it "maybe done".
 */
export async function runApprovedMcpAction(runId: string): Promise<void> {
  const taken = await prisma.agentRun.updateMany({ where: { id: runId, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date(), lockedBy: "crm" } })
  if (taken.count !== 1) return
  try {
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId }, select: { workspaceId: true, input: true } })
    const why = await blocked(run.workspaceId, (run.input as { tokenId?: unknown } | null)?.tokenId)
    if (why) {
      await prisma.agentApproval.updateMany({ where: { runId, status: "APPROVED", executionStartedAt: null }, data: { executedAt: new Date(), result: { error: why } } })
      await finishRun(runId, { status: "FAILED", error: why })
      return
    }
    registerMcpTools()
    const ctx = await loadRunContext(runId)
    const out = await executeApprovedCalls({ run: ctx, policy: (await mcpAccess(run.workspaceId)).policy })
    const error = out.failed[0]?.error ?? (out.uncertain.length ? "Action peut-être faite (arrêt pendant son exécution) : vérifiez dans Cleads avant de la refaire." : null)
    const output = out.done.map((d) => ({ tool: d.tool, output: d.output }))
    await finishRun(runId, error ? { status: "FAILED", error, output } : { status: "SUCCEEDED", output })
  } catch (error) {
    await finishRun(runId, { status: "FAILED", error: errorText(error) })
  }
}
