import { experimental_decide, Experimental_DecisionRefusalError, generateText, InvalidResponseDataError, NoObjectGeneratedError, Output, streamText, type Experimental_DecisionModel, type Experimental_DecisionQuestion, type Experimental_DecisionState, type LanguageModel } from "ai"
import type { z } from "zod"
import { LeadError } from "@/features/leads/errors"
import { getAiSettings } from "@/lib/ai/budget"
import { DEFAULT_THRESHOLDS, confidenceOf, decisionFallbacks, outcomeOf, validThresholds, valueOf, type DecisionAnswer, type DecisionOutcome, type Thresholds } from "@/lib/ai/decide"
import { aiConfigured, gatewayOptions } from "@/lib/ai/gateway"
import { ROLES, modelLabel, resolveRole, type AiRole } from "@/lib/ai/models"
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
/** What one screenshot weighs in the prompt, at most, for the budget check (a 1350 × 940 capture is about 1 700 tokens). */
export const IMAGE_TOKENS = 1_800
const NO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }

const notConfigured = () => new LeadError("unavailable", "L'IA n'est pas configurée sur ce serveur : la clé AI_GATEWAY_API_KEY manque.", 503)
const unavailable = () => new LeadError("unavailable", "Le service IA n'a pas répondu, modèles de secours compris. Réessayez dans quelques minutes.", 503)

/**
 * What a failed call still consumed. An answer that came back cut off or unreadable was generated, and the Gateway bills
 * it: it is charged to the run like any other, so the run's cap and the month's budget see it.
 */
export function usageOf(error: unknown): TokenUsage {
  return NoObjectGeneratedError.isInstance(error) && error.usage ? tokenUsage(error.usage) : NO_USAGE
}

/** The error behind a failed call: the SDK wraps repeated failures in a RetryError. */
function rootError(error: unknown): { type?: string; statusCode?: number; message?: string } | null {
  const e = error as { lastError?: unknown; errors?: unknown[] } | null
  const root = e?.lastError ?? (Array.isArray(e?.errors) && e.errors.length ? e.errors[e.errors.length - 1] : error)
  return root && typeof root === "object" ? (root as { type?: string; statusCode?: number; message?: string }) : null
}

/**
 * What a failed model call means for the run. A passing failure (provider down, rate limit, timeout) is tried again
 * later; a setting a person must change (credits, key, model) ends the run at once, with what to do.
 */
export function modelCallError(error: unknown, model: string, role: AiRole): LeadError {
  // The model did answer, but not with the expected structure.
  if (NoObjectGeneratedError.isInstance(error)) {
    // Cut at the output limit (reasoning counts against it): the same call would be cut the same way, so no retry.
    if (error.finishReason === "length") {
      return new LeadError("invalid", "La réponse de l’IA a été coupée avant la fin (longueur maximale atteinte) : rien n’est enregistré, et l’exécution n’est pas relancée, car elle serait coupée de la même façon.", 400)
    }
    return new LeadError("unavailable", "L’IA a rendu une réponse illisible : l’exécution sera relancée.", 503)
  }
  // A decision model may decline a question: a person decides, and asking again would get the same answer.
  if (Experimental_DecisionRefusalError.isInstance(error)) {
    return new LeadError("invalid", "Le modèle de décision a refusé de répondre : une personne décidera.", 400, { refusal: true, questions: error.questionIds })
  }
  // A decision model answered outside its contract (an incomplete probability distribution): another try may do better.
  if (InvalidResponseDataError.isInstance(error)) return new LeadError("unavailable", "L’IA a rendu une réponse invalide : l’exécution sera relancée.", 503)
  const e = rootError(error)
  const text = e?.message ?? ""
  const label = modelLabel(model)
  const where = `Réglages › IA, rôle « ${ROLES[role].label} »`
  if (e?.statusCode === 402 || /free tier|credits|top-?up|payment|billing|insufficient (funds|balance)/i.test(text)) {
    return new LeadError("forbidden", `Le compte Vercel AI Gateway n'a pas accès à ${label} (offre gratuite ou crédits épuisés). Ajoutez des crédits dans Vercel › AI Gateway, ou choisissez un autre modèle (${where}).`, 403)
  }
  if (e?.type === "authentication_error" || e?.statusCode === 401) return new LeadError("forbidden", "La passerelle IA refuse la clé AI_GATEWAY_API_KEY (invalide ou révoquée) : vérifiez-la sur le serveur.", 403)
  if (e?.type === "forbidden" || e?.statusCode === 403) return new LeadError("forbidden", `La passerelle IA refuse l'accès à ${label} : vérifiez le compte Vercel AI Gateway, ou choisissez un autre modèle (${where}).`, 403)
  if (e?.type === "model_not_found" || e?.statusCode === 404) return new LeadError("invalid", `${label} n'est pas disponible sur la passerelle IA : choisissez un autre modèle (${where}).`, 400)
  if (e?.type === "invalid_request_error" || e?.statusCode === 400) return new LeadError("invalid", `La passerelle IA a refusé la demande : ${text.slice(0, 200) || "requête invalide"}.`, 400)
  return unavailable()
}

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
  /** Images given with the prompt (screenshots of an audited site). */
  images?: { data: Uint8Array; mediaType: string }[]
  maxOutputTokens?: number
  /** The worker aborts it when the run is cancelled. */
  abortSignal?: AbortSignal
  /**
   * Streams a long text answer (a whole page, E23): a request that waits minutes for its first byte would hit the
   * HTTP client's timeouts. Text answers only.
   */
  stream?: boolean
}

/** A streamed call read to its end: the same fields generateText gives, or the error that stopped the stream. */
async function streamed(call: Parameters<typeof streamText>[0]) {
  let failure: unknown = null
  const result = streamText({ ...call, onError: ({ error }) => void (failure ??= error) })
  for await (const part of result.stream) if (part.type === "error") failure ??= part.error
  if (failure) throw failure
  const [text, totalUsage, finishReason, response, providerMetadata] = await Promise.all([result.text, result.totalUsage, result.finishReason, result.response, result.providerMetadata])
  return { text, totalUsage, finishReason, response, providerMetadata }
}

export async function generateForRun<T = never>(
  ctx: RunContext,
  opts: GenerateOptions<T>,
  deps: ModelDeps = {}
): Promise<{ text: string; output: T | undefined; model: string; costMicros: number; finishReason: string }> {
  if (!deps.languageModel && !aiConfigured()) throw notConfigured()
  const [settings, prices, remaining] = await Promise.all([getAiSettings(ctx.workspaceId), deps.prices ?? priceTable(), remainingMicros(ctx.id)])
  const { model, fallbacks } = resolveRole(opts.role, settings.roleModels)
  const candidates = [model, ...fallbacks]
  const images = opts.images ?? []
  const inputTokens = estimateTokens(`${opts.system ?? ""}${opts.prompt}`) + images.length * IMAGE_TOKENS
  const room = maxOutputTokensWithin(worstPrice(candidates, prices), remaining, inputTokens, settings.eurPerUsd)
  if (room < MIN_OUTPUT_TOKENS) return overBudget(ctx)

  const content = images.length
    ? { messages: [{ role: "user" as const, content: [{ type: "text" as const, text: opts.prompt }, ...images.map((i) => ({ type: "file" as const, data: i.data, mediaType: i.mediaType }))] }] }
    : { prompt: opts.prompt }
  const call = {
    model: deps.languageModel ? deps.languageModel(model) : model,
    system: opts.system,
    ...content,
    maxOutputTokens: Math.min(opts.maxOutputTokens ?? 4096, room),
    providerOptions: gatewayOptions({ models: fallbacks, userKey: ctx.userKey, agentId: ctx.agentId }),
    abortSignal: opts.abortSignal,
  }
  const started = Date.now()
  try {
    const result = opts.schema ? await generateText({ ...call, output: Output.object({ schema: opts.schema }) }) : opts.stream ? await streamed(call) : await generateText(call)
    const served = servedModel(result.response?.modelId, candidates)
    const output = opts.schema ? ((result as { output?: unknown }).output as T) : undefined
    const step = await recordModelStep(ctx, {
      type: "MODEL",
      name: opts.name,
      model: served,
      usage: tokenUsage(result.totalUsage),
      durationMs: Date.now() - started,
      input: { system: opts.system, prompt: opts.prompt, ...(images.length ? { images: images.map((i) => `${i.mediaType}, ${i.data.length} octets`) } : {}) },
      output: output ?? result.text,
      generationId: generationIdOf(result.providerMetadata),
      prices,
    })
    return { text: result.text, output, model: served, costMicros: step.costMicros, finishReason: result.finishReason }
  } catch (error) {
    const answered = NoObjectGeneratedError.isInstance(error) ? error : null
    await recordModelStep(ctx, {
      type: "MODEL",
      name: opts.name,
      model: answered ? servedModel(answered.response?.modelId, candidates) : model,
      usage: usageOf(error),
      durationMs: Date.now() - started,
      output: { error: error instanceof Error ? error.message : String(error), ...(answered?.finishReason ? { finishReason: answered.finishReason } : {}) },
      prices,
    })
    console.error("[AI_GENERATE]", ctx.agentId, error)
    throw modelCallError(error, model, opts.role)
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
  opts: {
    name: string
    state: Experimental_DecisionState
    questions: Q
    thresholds?: Thresholds
    abortSignal?: AbortSignal
    /** What the step keeps of the state: by default the state itself; a summary when it holds personal data (a reply). */
    stateForLog?: string
  },
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
      abortSignal: opts.abortSignal,
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
      input: { questions: Object.keys(opts.questions), state: opts.stateForLog ?? opts.state },
      output: answers,
      generationId: generationIdOf(result.providerMetadata as Record<string, Record<string, unknown>> | undefined),
      prices,
    })
    return { answers, model: served, costMicros: step.costMicros }
  } catch (error) {
    await recordModelStep(ctx, { type: "DECISION", name: opts.name, model, usage: NO_USAGE, durationMs: Date.now() - started, output: { error: error instanceof Error ? error.message : String(error) }, prices })
    console.error("[AI_DECIDE]", ctx.agentId, error)
    throw modelCallError(error, model, "decision")
  }
}
