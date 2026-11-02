import { experimental_decide, generateText, Output, type Experimental_DecisionModel, type Experimental_DecisionQuestion, type Experimental_DecisionState, type LanguageModel } from "ai"
import type { z } from "zod"
import { LeadError } from "@/features/leads/errors"
import { getAiSettings } from "@/lib/ai/budget"
import { DEFAULT_THRESHOLDS, confidenceOf, decisionFallbacks, outcomeOf, validThresholds, valueOf, type DecisionAnswer, type DecisionOutcome, type Thresholds } from "@/lib/ai/decide"
import { aiConfigured, gatewayOptions } from "@/lib/ai/gateway"
import { resolveRole, type AiRole } from "@/lib/ai/models"
import { estimateTokens, maxOutputTokensWithin, priceTable, tokenUsage, worstPrice, type ModelPrice, type TokenUsage } from "@/lib/ai/pricing"
import { finishRun, recordModelStep, remainingMicros, type RunContext } from "./runs"

/**
 * Model calls billed to a run. Each call goes through the role's model with its Gateway fallbacks, never produces more
 * than the run can still pay for (its output is capped from the worst price of the candidates), and is recorded as a
 * step with its usage and cost, failures included.
 */
export interface ModelDeps {
  /** Tests: replaces the Gateway with a model per id. */
  languageModel?: (id: string) => LanguageModel
  decisionModel?: (id: string) => Experimental_DecisionModel
  prices?: Record<string, ModelPrice>
}

/** Below this, a written answer would be cut off: the run stops instead. */
export const MIN_OUTPUT_TOKENS = 256
const NO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }

const notConfigured = () => new LeadError("unavailable", "L'IA n'est pas configurée sur ce serveur : la clé AI_GATEWAY_API_KEY manque.", 503)
const unavailable = () => new LeadError("unavailable", "Le service IA n'a pas répondu, modèles de secours compris. Réessayez dans quelques minutes.", 503)

async function overBudget(ctx: RunContext): Promise<never> {
  await finishRun(ctx.id, { status: "BUDGET_EXCEEDED", error: "Plafond de l'exécution atteint" })
  throw new LeadError("budget_exceeded", "Le plafond de cette exécution est atteint : l'IA s'est arrêtée avant de le dépasser.", 429, { scope: "run" })
}

/** The model that answered when the Gateway reports one of the candidates; the requested one otherwise. */
const servedModel = (reported: string | undefined, candidates: string[]) => (reported && candidates.includes(reported) ? reported : candidates[0])

const generationIdOf = (metadata: Record<string, Record<string, unknown>> | undefined) => {
  const id = metadata?.gateway?.generationId
  return typeof id === "string" ? id : null
}

export interface GenerateOptions<T> {
  role: Exclude<AiRole, "decision">
  /** Step name in the run's history. */
  name: string
  system?: string
  prompt: string
  /** Structured answer, validated by the SDK. */
  schema?: z.ZodType<T>
  maxOutputTokens?: number
}

export async function generateForRun<T = never>(
  ctx: RunContext,
  opts: GenerateOptions<T>,
  deps: ModelDeps = {}
): Promise<{ text: string; output: T | undefined; model: string; costMicros: number }> {
  if (!deps.languageModel && !aiConfigured()) throw notConfigured()
  const [settings, prices, remaining] = await Promise.all([getAiSettings(ctx.workspaceId), deps.prices ?? priceTable(), remainingMicros(ctx.id)])
  const { model, fallbacks } = resolveRole(opts.role, settings.roleModels)
  const candidates = [model, ...fallbacks]
  const room = maxOutputTokensWithin(worstPrice(candidates, prices), remaining, estimateTokens(`${opts.system ?? ""}${opts.prompt}`), settings.eurPerUsd)
  if (room < MIN_OUTPUT_TOKENS) return overBudget(ctx)

  const call = {
    model: deps.languageModel ? deps.languageModel(model) : model,
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: Math.min(opts.maxOutputTokens ?? 4096, room),
    providerOptions: gatewayOptions({ models: fallbacks, userKey: ctx.userKey, agentId: ctx.agentId }),
  }
  const started = Date.now()
  try {
    const result = opts.schema ? await generateText({ ...call, output: Output.object({ schema: opts.schema }) }) : await generateText(call)
    const served = servedModel(result.response?.modelId, candidates)
    const output = opts.schema ? ((result as { output?: unknown }).output as T) : undefined
    const step = await recordModelStep(ctx, {
      type: "MODEL",
      name: opts.name,
      model: served,
      usage: tokenUsage(result.totalUsage),
      durationMs: Date.now() - started,
      input: { system: opts.system, prompt: opts.prompt },
      output: output ?? result.text,
      generationId: generationIdOf(result.providerMetadata),
      prices,
    })
    return { text: result.text, output, model: served, costMicros: step.costMicros }
  } catch (error) {
    await recordModelStep(ctx, { type: "MODEL", name: opts.name, model, usage: NO_USAGE, durationMs: Date.now() - started, output: { error: error instanceof Error ? error.message : String(error) }, prices })
    console.error("[AI_GENERATE]", ctx.agentId, error)
    throw unavailable()
  }
}

export interface DecisionView {
  type: DecisionAnswer["type"]
  value: string | number | boolean | null
  /** Confidence in the selected answer, when the model gives one. */
  confidence: number | null
  outcome: DecisionOutcome
}

export async function decideForRun<Q extends Record<string, Experimental_DecisionQuestion>>(
  ctx: RunContext,
  opts: { name: string; state: Experimental_DecisionState; questions: Q; thresholds?: Thresholds },
  deps: ModelDeps = {}
): Promise<{ answers: Record<keyof Q & string, DecisionView>; model: string; costMicros: number }> {
  if (!deps.decisionModel && !aiConfigured()) throw notConfigured()
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS
  if (!validThresholds(thresholds)) throw new Error("Seuils de décision invalides")
  const [settings, prices, remaining] = await Promise.all([getAiSettings(ctx.workspaceId), deps.prices ?? priceTable(), remainingMicros(ctx.id)])
  const { model, fallbacks } = resolveRole("decision", settings.roleModels)
  const candidates = [model, ...fallbacks]
  // A decision costs its input (its output is free or tiny): refuse only when even the input would not fit.
  const inputTokens = estimateTokens(JSON.stringify(opts.state) + JSON.stringify(opts.questions))
  if (maxOutputTokensWithin(worstPrice(candidates, prices), remaining, inputTokens, settings.eurPerUsd) < 1) return overBudget(ctx)

  const started = Date.now()
  try {
    const result = await experimental_decide({
      model: deps.decisionModel ? deps.decisionModel(model) : model,
      state: opts.state,
      questions: opts.questions,
      providerOptions: gatewayOptions({ models: decisionFallbacks(fallbacks, thresholds), userKey: ctx.userKey, agentId: ctx.agentId }),
    })
    const answers = {} as Record<keyof Q & string, DecisionView>
    for (const id of Object.keys(opts.questions) as (keyof Q & string)[]) {
      const answer = (result.answers as Record<string, DecisionAnswer>)[id]
      const confidence = confidenceOf(answer)
      answers[id] = { type: answer.type, value: valueOf(answer), confidence, outcome: outcomeOf(confidence, thresholds) }
    }
    const served = servedModel(result.response?.modelId, candidates)
    const step = await recordModelStep(ctx, {
      type: "DECISION",
      name: opts.name,
      model: served,
      usage: tokenUsage({ inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }),
      durationMs: Date.now() - started,
      input: { questions: Object.keys(opts.questions), state: opts.state },
      output: answers,
      generationId: generationIdOf(result.providerMetadata as Record<string, Record<string, unknown>> | undefined),
      prices,
    })
    return { answers, model: served, costMicros: step.costMicros }
  } catch (error) {
    await recordModelStep(ctx, { type: "DECISION", name: opts.name, model, usage: NO_USAGE, durationMs: Date.now() - started, output: { error: error instanceof Error ? error.message : String(error) }, prices })
    console.error("[AI_DECIDE]", ctx.agentId, error)
    throw unavailable()
  }
}
