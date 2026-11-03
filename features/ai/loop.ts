import type { ModelMessage, StepResult, StopCondition, ToolSet } from "ai"
import { getAiSettings } from "@/lib/ai/budget"
import type { AiRole } from "@/lib/ai/models"
import { estimateTokens, maxOutputTokensWithin, priceTable, tokenUsage, worstPrice, type ModelPrice } from "@/lib/ai/pricing"
import { MIN_OUTPUT_TOKENS, modelFor, type ModelDeps } from "./calls"
import { recordModelStep, remainingMicros, type RunContext } from "./runs"

/**
 * The budget of an agent that picks its own tools in a loop (the copilot E24, the Stratège E25): each step's answer is
 * capped by what the run can still pay at the worst price of the model and its fallbacks, the loop stops before a step
 * the run could not pay for, and every finished step is billed to the run before the next one starts. In an evaluation,
 * the model pinned for the role answers alone (E27).
 */
export interface LoopBudget {
  model: string
  fallbacks: string[]
  prices: Record<string, ModelPrice>
  /** For `prepareStep`: the step's maximum answer. */
  prepareStep: (input: { messages: ModelMessage[] }) => Promise<{ maxOutputTokens: number }>
  /** For `stopWhen`: true before a step the run could not pay for. */
  overBudget: StopCondition<ToolSet>
  /** The loop stopped because of the budget. */
  stoppedByBudget: () => boolean
  /** Whether the run can pay for a short answer to these messages, before the first call. */
  fits: (messages: readonly ModelMessage[]) => Promise<boolean>
  /** Bills a finished step (its usage and the model that answered); returns its cost in micro-euros. */
  bill: (step: StepResult<ToolSet>) => Promise<number>
}

export interface LoopOptions {
  role: Exclude<AiRole, "decision">
  /** The agent's instructions, counted in each step's input. */
  system: string
  /** Room for one step's answer, reasoning included. */
  stepTokens: number
  /** What the tools' descriptions and schemas weigh in each request; for tools loaded on demand, from the messages. */
  toolsTokens: number | ((messages: readonly ModelMessage[]) => number)
  /** Steps are recorded as `${stepName}-${n}`. */
  stepName: string
}

export async function loopBudget(run: RunContext, opts: LoopOptions, deps: ModelDeps = {}): Promise<LoopBudget> {
  const [settings, prices] = await Promise.all([getAiSettings(run.workspaceId), deps.prices ?? priceTable()])
  const { model, fallbacks } = modelFor(run, opts.role, settings.roleModels)
  const candidates = [model, ...fallbacks]
  const worst = worstPrice(candidates, prices)
  const toolsOf = (messages: readonly ModelMessage[]) => (typeof opts.toolsTokens === "function" ? opts.toolsTokens(messages) : opts.toolsTokens)
  const inputOf = (messages: readonly ModelMessage[]) => estimateTokens(opts.system) + toolsOf(messages) + estimateTokens(JSON.stringify(messages))
  const room = async (inputTokens: number) => maxOutputTokensWithin(worst, await remainingMicros(run.id), inputTokens, settings.eurPerUsd)
  let over = false
  /** Input of the step that just ran: the next one reads it again, plus what the step added. */
  let lastInput = 0

  return {
    model,
    fallbacks,
    prices,
    prepareStep: async ({ messages }) => {
      lastInput = inputOf(messages)
      return { maxOutputTokens: Math.max(Math.min(opts.stepTokens, await room(lastInput)), MIN_OUTPUT_TOKENS) }
    },
    overBudget: async ({ steps }) => {
      const last = steps.at(-1)
      if (!last?.toolCalls.length) return false
      over = (await room(lastInput + estimateTokens(JSON.stringify(last.content)))) < MIN_OUTPUT_TOKENS
      return over
    },
    stoppedByBudget: () => over,
    fits: async (messages) => (await room(inputOf(messages))) >= MIN_OUTPUT_TOKENS,
    bill: async (step) => {
      const reported = step.response?.modelId
      const served = reported && candidates.includes(reported) ? reported : model
      const gateway = (step.providerMetadata as Record<string, Record<string, unknown>> | undefined)?.gateway
      const { costMicros } = await recordModelStep(run, {
        type: "MODEL",
        name: `${opts.stepName}-${step.stepNumber + 1}`,
        model: served,
        usage: tokenUsage(step.usage),
        durationMs: 0,
        input: { step: step.stepNumber + 1 },
        output: { text: step.text.slice(0, 1_500), tools: step.toolCalls.map((c) => c.toolName), finishReason: step.finishReason },
        generationId: typeof gateway?.generationId === "string" ? gateway.generationId : null,
        prices,
      })
      return costMicros
    },
  }
}
