import { getToolName, isToolUIPart } from "ai"
import { z } from "zod"
import { audit } from "@/lib/audit"
import { withActing } from "@/lib/ai/acting"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { effectiveAgent } from "@/features/ai/definitions"
import type { RunContext } from "@/features/ai/runs"
import { ACTIONS } from "@/features/ai/actions/catalog"
import { conversationFor, loadMessages, releaseTurn, saveMessage, takeTurn } from "./conversations"

/**
 * Putting back what an action without a click did (E28): a task created, a task marked done or moved, tags added or
 * removed. The browser only names the call; the server reads its output from the stored conversation, runs the
 * action's own undo as the person, with her rights of now, and marks the call undone. Once only.
 */
export const undoSchema = z.object({ conversationId: z.string().min(1).max(40), toolCallId: z.string().min(1).max(100) })

export async function undoAction(user: CurrentUser, input: z.infer<typeof undoSchema>): Promise<{ undone: true }> {
  if (!can(user.role, "ai:use")) throw new LeadError("forbidden", "Votre rôle ne permet pas d'utiliser le copilote.", 403)
  const conversation = await conversationFor(user, input.conversationId)
  if (!(await takeTurn(conversation.id))) throw new LeadError("conflict", "Le copilote répond dans cette conversation : réessayez à la fin de sa réponse.", 409)
  try {
    const history = await loadMessages(conversation.id)
    const message = history.find((m) => m.role === "assistant" && m.parts.some((p) => isToolUIPart(p) && p.toolCallId === input.toolCallId))
    const part = message?.parts.find((p) => isToolUIPart(p) && p.toolCallId === input.toolCallId)
    if (!message || !part || !isToolUIPart(part) || part.state !== "output-available") throw new LeadError("not_found", "Action introuvable dans cette conversation.", 404)
    const name = getToolName(part)
    const def = ACTIONS.find((a) => a.name === name)
    const output = part.output as Record<string, unknown> | null
    if (!def?.undo || !output || output.done !== true) throw new LeadError("conflict", "Cette action ne s'annule pas d'ici.", 409)
    if (output.undone === true) throw new LeadError("conflict", "Cette action est déjà annulée.", 409)

    const runId = message.metadata?.runIds?.at(-1) ?? "annulation"
    const run: RunContext = { id: runId, workspaceId: user.workspaceId, agentId: "copilot", requester: user, userKey: user.id, leadId: null }
    const policy = (await effectiveAgent(user.workspaceId, "copilot")).policy
    await withActing({ agentId: "copilot", runId, tool: name }, () => def.undo!({ run, policy }, output))
    const updated = { ...message, parts: message.parts.map((p) => (isToolUIPart(p) && p.toolCallId === input.toolCallId ? ({ ...p, output: { ...output, undone: true } } as typeof p) : p)) }
    await saveMessage(conversation.id, updated)
    await audit({ action: "ai.copilot_undo", actorId: user.id, workspaceId: user.workspaceId, entityType: "AiConversation", entityId: conversation.id, metadata: { tool: name, runId } })
    return { undone: true }
  } finally {
    await releaseTurn(conversation.id)
  }
}
