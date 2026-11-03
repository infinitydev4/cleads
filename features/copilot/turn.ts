import { after } from "next/server"
import { convertToModelMessages, createIdGenerator, createUIMessageStream, createUIMessageStreamResponse, isToolUIPart, toUIMessageStream, type StepResult, type ToolSet } from "ai"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { aiConfigured } from "@/lib/ai/gateway"
import { LeadError } from "@/features/leads/errors"
import { modelCallError, type ModelDeps } from "@/features/ai/calls"
import { finishRun, startRun, type RunContext } from "@/features/ai/runs"
import { copilotAgent, type CopilotSetup } from "./agent"
import { describePage, parsePage } from "./context"
import { closeTurn, conversationFor, createConversation, followLeads, loadMessages, releaseTurn, saveMessage, takeTurn } from "./conversations"
import { ACTION_TOOLS, leadIdsOf, recentTools } from "./labels"
import { answersSchema, applyAnswers, forModel, pendingApprovals, questionSchema, questionText, refusePending, type CopilotMessage, type CopilotMetadata } from "./messages"

/**
 * One turn of the copilot (E24): a question, or the person's answers to the approvals of the last answer. The turn is
 * a run of the "copilot" agent (status RUNNING, done during the request): it reserves the agent's cap before anything is
 * written, pays for each step, and ends with the answer saved, whatever happens to the connection.
 *
 * The answer streams to the panel. A turn that would outlast the platform's limit for a request stops at
 * TURN_DEADLINE_MS, says so, and keeps what was written.
 */

/**
 * Longest a turn lasts, counted from the request's arrival. Netlify cuts a streamed response 60 s after the request
 * started (measured on 2 November 2026 on a deploy preview, docs/crm-v1/AGENTS-IA.md §17): the turn stops before, with
 * time left to save its answer.
 */
export const TURN_DEADLINE_MS = 50_000
/** A turn that starts late still gets this long to answer. */
const MIN_TURN_MS = 5_000

/** Tells the panel which conversation a new one became. */
export const CONVERSATION_HEADER = "x-copilot-conversation"

export const turnRequestSchema = z.object({
  conversationId: z.string().min(1).max(40).nullish(),
  message: z.unknown(),
  /** The page the panel sits on (in the 3D view, the open window's), for "cette fiche". */
  page: z.string().max(2_000).nullish(),
})

export interface TurnDeps extends ModelDeps {
  /** Keeps the request alive until the answer is saved (Next's `after`). */
  keepAlive?: (task: Promise<unknown>) => void
  deadlineMs?: number
  /** When the request arrived (ms): the turn's deadline counts from there. */
  startedAt?: number
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** How a turn that could not stream ends: refused (busy), over its cap, or failed. */
const endOf = (error: unknown) => (error instanceof LeadError && error.code === "conflict" ? "CANCELLED" : error instanceof LeadError && error.code === "budget_exceeded" ? "BUDGET_EXCEEDED" : "FAILED")

function keepAlive(task: Promise<unknown>) {
  try {
    after(() => task)
  } catch {
    // Outside a request (tests, scripts): the promise runs on its own.
  }
}

export async function copilotTurn(user: CurrentUser, body: unknown, signal: AbortSignal | undefined, deps: TurnDeps = {}): Promise<Response> {
  deps = { ...deps, startedAt: deps.startedAt ?? Date.now() }
  if (!can(user.role, "ai:use")) throw new LeadError("forbidden", "Votre rôle ne permet pas d'utiliser le copilote.", 403)
  if (!deps.languageModel && !aiConfigured()) throw new LeadError("unavailable", "L'IA n'est pas configurée sur ce serveur : la clé AI_GATEWAY_API_KEY manque.", 503)
  const req = turnRequestSchema.parse(body)
  const question = questionSchema.safeParse(req.message)
  if (question.success) return ask(user, req, question.data, signal, deps)
  const answers = answersSchema.safeParse(req.message)
  if (answers.success && req.conversationId) return answer(user, req.conversationId, answers.data, signal, deps)
  throw new LeadError("invalid", "Message invalide.", 400)
}

async function ask(user: CurrentUser, req: z.infer<typeof turnRequestSchema>, q: z.infer<typeof questionSchema>, signal: AbortSignal | undefined, deps: TurnDeps): Promise<Response> {
  const text = questionText(q.parts)
  if (!text) throw new LeadError("invalid", "Écrivez votre question.", 400)
  const context = await describePage(user, parsePage(req.page))
  // The run first: a turn the budget cannot pay for writes nothing.
  const run = await startRun(user, { agentId: "copilot", status: "RUNNING" })
  let conversationId: string | null = null
  try {
    conversationId = req.conversationId ? (await conversationFor(user, req.conversationId)).id : await createConversation(user, text, context)
    if (!(await takeTurn(conversationId))) {
      conversationId = null
      throw new LeadError("conflict", "Le copilote répond déjà dans cette conversation : attendez la fin de sa réponse.", 409)
    }
    await prisma.agentRun.update({ where: { id: run.id }, data: { input: { conversationId } } })
    const history = await loadMessages(conversationId)
    if (history.some((m) => m.id === q.id)) throw new LeadError("conflict", "Cette question a déjà été envoyée.", 409)
    const last = history.at(-1)
    if (last && pendingApprovals(last)) {
      const { message } = refusePending(last)
      await saveMessage(conversationId, message)
      history[history.length - 1] = message
    }
    const metadata: CopilotMetadata = {
      at: new Date().toISOString(),
      ...(context ? { context: { path: context.path, label: context.label, line: context.line, ...(context.leadId ? { leadId: context.leadId } : {}), ...(context.campaignId ? { campaignId: context.campaignId } : {}) } } : {}),
    }
    const message: CopilotMessage = { id: q.id, role: "user", parts: [{ type: "text", text }], metadata }
    await saveMessage(conversationId, message)
    // The question names the page's fiche: the conversation follows it from now on.
    if (context?.leadId) await followLeads(conversationId, [context.leadId])
    history.push(message)
    return await stream(user, run, conversationId, history, signal, deps)
  } catch (error) {
    if (conversationId) await releaseTurn(conversationId)
    await finishRun(run.id, { status: endOf(error), error: errorText(error) })
    throw error
  }
}

async function answer(user: CurrentUser, conversationId: string, incoming: z.infer<typeof answersSchema>, signal: AbortSignal | undefined, deps: TurnDeps): Promise<Response> {
  const conversation = await conversationFor(user, conversationId)
  if (!(await takeTurn(conversation.id))) throw new LeadError("conflict", "Le copilote répond déjà dans cette conversation : attendez la fin de sa réponse.", 409)
  let run: RunContext | null = null
  try {
    const history = await loadMessages(conversation.id)
    const last = history.at(-1)
    if (!last || last.role !== "assistant" || last.id !== incoming.id || !pendingApprovals(last)) throw new LeadError("conflict", "Plus rien n'attend votre validation dans cette conversation.", 409)
    const { message, answered } = applyAnswers(last, incoming)
    if (!answered || pendingApprovals(message)) throw new LeadError("conflict", "Répondez à chaque demande de validation de ce message.", 409)
    history[history.length - 1] = message

    const approved = message.parts.some((p) => isToolUIPart(p) && p.state === "approval-responded" && p.approval.approved)
    if (!approved) return await refuseAll(conversation.id, history)

    // The run before the decisions are kept: an approved call is never left behind without a turn to run it.
    run = await startRun(user, { agentId: "copilot", status: "RUNNING", input: { conversationId: conversation.id } })
    await saveMessage(conversation.id, message)
    return await stream(user, run, conversation.id, history, signal, deps)
  } catch (error) {
    await releaseTurn(conversation.id)
    if (run) await finishRun(run.id, { status: endOf(error), error: errorText(error) })
    throw error
  }
}

/** Every call was refused: nothing runs and nothing is paid; the cards say "refusée". */
async function refuseAll(conversationId: string, history: CopilotMessage[]): Promise<Response> {
  const last = history[history.length - 1]
  const denied = last.parts.filter((p) => isToolUIPart(p) && p.state === "approval-responded")
  const message: CopilotMessage = {
    ...last,
    parts: last.parts.map((p) => (isToolUIPart(p) && p.state === "approval-responded" ? ({ ...p, state: "output-denied" } as unknown as typeof p) : p)),
  }
  await saveMessage(conversationId, message)
  await closeTurn(conversationId, { costMicros: 0, leadIds: [] })
  const ui = createUIMessageStream<CopilotMessage>({
    originalMessages: history,
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId: last.id })
      for (const p of denied) if (isToolUIPart(p)) writer.write({ type: "tool-output-denied", toolCallId: p.toolCallId })
      writer.write({ type: "finish" })
    },
  })
  return createUIMessageStreamResponse({ stream: ui, headers: { [CONVERSATION_HEADER]: conversationId } })
}

/** A failure in words for the person: the Gateway's errors are explained, the rest stays generic. */
function failureText(error: unknown, setup: CopilotSetup): string {
  if (error instanceof LeadError) return error.message
  return modelCallError(error, setup.model, "writer").message
}

async function stream(user: CurrentUser, run: RunContext, conversationId: string, history: CopilotMessage[], signal: AbortSignal | undefined, deps: TurnDeps): Promise<Response> {
  const setup = await copilotAgent(user, run, deps, { recent: recentTools(history) })
  // The time already spent preparing the turn (rights, conversation, instructions) counts against the platform's limit.
  const spent = Date.now() - (deps.startedAt ?? Date.now())
  const deadline = AbortSignal.timeout(Math.max((deps.deadlineMs ?? TURN_DEADLINE_MS) - spent, Math.min(MIN_TURN_MS, deps.deadlineMs ?? MIN_TURN_MS)))
  const abortSignal = signal ? AbortSignal.any([signal, deadline]) : deadline
  const previous = history.at(-1)?.role === "assistant" ? history.at(-1)!.metadata : undefined
  const runIds = [...(previous?.runIds ?? []), run.id]
  const steps: StepResult<ToolSet>[] = []
  let turnCost = 0
  let failure: unknown = null

  const prompt = await convertToModelMessages(forModel(history), { tools: setup.tools, ignoreIncompleteToolCalls: true })
  // Even a short answer would not fit in the turn's cap: nothing is called, and the person is told why.
  if (!(await setup.fits(prompt))) {
    throw new LeadError("budget_exceeded", "Cette conversation est trop longue pour le plafond d'un tour du copilote : ouvrez une nouvelle conversation.", 429, { scope: "run" })
  }
  const result = await setup.agent.stream({
    prompt,
    abortSignal,
    onStepEnd: async (step) => {
      steps.push(step)
      turnCost += await setup.bill(step)
    },
    onToolExecutionEnd: async (event) => {
      const { toolCall, toolOutput } = event as { toolCall: { toolName: string; input: unknown }; toolOutput: { type: string } }
      if (!ACTION_TOOLS.has(toolCall.toolName) || toolOutput.type !== "tool-result") return
      const leadId = (toolCall.input as { leadId?: unknown } | null)?.leadId
      await audit({ action: "ai.copilot_action", actorId: user.id, workspaceId: user.workspaceId, entityType: "Lead", entityId: typeof leadId === "string" ? leadId : undefined, metadata: { tool: toolCall.toolName, runId: run.id } })
    },
  })

  // The request stays alive until the answer is saved, even when the panel went away.
  let settle!: () => void
  ;(deps.keepAlive ?? keepAlive)(new Promise<void>((resolve) => (settle = resolve)))

  const metadataOf = (stopped?: CopilotMetadata["stopped"]): CopilotMetadata => ({ runIds, model: setup.model, costMicros: (previous?.costMicros ?? 0) + turnCost, ...(stopped ? { stopped } : {}) })

  const ui = toUIMessageStream<ToolSet, CopilotMessage>({
    stream: result.stream,
    tools: setup.tools,
    originalMessages: history,
    generateMessageId: createIdGenerator({ prefix: "a", size: 16 }),
    sendReasoning: false,
    messageMetadata: ({ part }) => (part.type === "start" || part.type === "finish" ? metadataOf() : undefined),
    onError: (error) => {
      failure ??= error
      return failureText(error, setup)
    },
    // Saved after every step: a request cut by the platform keeps what was done.
    onStepEnd: async ({ responseMessage }) => {
      await saveMessage(conversationId, { ...responseMessage, metadata: metadataOf() }, { runId: run.id }).catch((e) => console.error("[COPILOT_SAVE]", e))
    },
    onEnd: async ({ responseMessage, isAborted }) => {
      try {
        const stopped = failure ? "error" : deadline.aborted ? "time" : isAborted ? "aborted" : setup.stopped(steps) ?? undefined
        const message = { ...responseMessage, metadata: metadataOf(stopped) }
        await saveMessage(conversationId, message, { runId: run.id })
        const budget = failure instanceof LeadError && failure.code === "budget_exceeded"
        await finishRun(run.id, {
          status: failure ? (budget ? "BUDGET_EXCEEDED" : "FAILED") : isAborted && !deadline.aborted ? "CANCELLED" : "SUCCEEDED",
          output: { conversationId, messageId: message.id, steps: steps.length, ...(stopped ? { stopped } : {}) },
          error: failure ? failureText(failure, setup) : null,
        })
        await closeTurn(conversationId, { costMicros: turnCost, leadIds: leadIdsOf(message) })
      } catch (error) {
        console.error("[COPILOT_END]", error)
        await releaseTurn(conversationId).catch(() => {})
      } finally {
        settle()
      }
    },
  })
  return createUIMessageStreamResponse({ stream: ui, headers: { [CONVERSATION_HEADER]: conversationId } })
}
