import { ToolLoopAgent, stepCountIs, type LanguageModel, type ModelMessage, type StepResult, type ToolSet } from "ai"
import type { CurrentUser } from "@/lib/auth/guard"
import { ROLE_LABELS } from "@/lib/crm/roles"
import { getAiSettings } from "@/lib/ai/budget"
import { gatewayOptions } from "@/lib/ai/gateway"
import { resolveRole } from "@/lib/ai/models"
import { estimateTokens, maxOutputTokensWithin, priceTable, tokenUsage, worstPrice, type ModelPrice } from "@/lib/ai/pricing"
import { MIN_OUTPUT_TOKENS, type ModelDeps } from "@/features/ai/calls"
import { agentRuntime } from "@/features/ai/runtime"
import { recordModelStep, remainingMicros, type RunContext } from "@/features/ai/runs"
import { chatTools } from "@/features/ai/tools"
import { toolsFor } from "./tools"

/**
 * The copilot as an AI SDK agent (E24): its instructions (persona, common rules, team instructions, skills, then how it
 * works here), the tools the person's role allows, and the run's limits. A turn is short: six steps at most, each one
 * paid for before the next starts, and stopped when the run's cap could not pay for another.
 */

/** Room for one step's answer, reasoning included: the copilot answers briefly and reasons little. */
export const STEP_OUTPUT_TOKENS = 2_000
/** What the tools' descriptions and schemas weigh in each request, for the budget check. */
const TOOLS_TOKENS = 3_500

export function copilotRules(user: Pick<CurrentUser, "role">): string {
  return `## Comment tu travailles ici
- Tu travailles pour la personne connectée (rôle : ${ROLE_LABELS[user.role]}). Tes outils voient exactement ce qu'elle voit dans le CRM, rien de plus : une fiche introuvable l'est aussi pour elle.
- Chaque question commence par la date et la page ouverte, entre crochets. « Cette fiche », « cette campagne », « la liste » désignent cette page.
- Lis avant de répondre : n'invente ni fiche, ni chiffre, ni date, ni identifiant. Retrouve un leadId avec search_leads plutôt que de le deviner.
- Les actions (tâche, note, audit, offres, brouillon d'email, maquette) passent par leur outil : la personne les valide d'un clic dans la conversation. Propose-les quand elles servent ; ne les annonce jamais comme faites avant leur résultat. Une action refusée ne se repropose pas, sauf si elle le redemande.
- Audit, offres, brouillon et maquette sont confiés aux agents spécialisés et continuent après ta réponse : une carte en suit l'avancement. Dis ce qui va se passer, pas ce qui s'est passé.
- Rien ne sort du CRM par toi : un email se relit et s'envoie depuis la fiche, par la personne.
- Réponds court, en français : quelques phrases ou une liste à puces, sans tableau ni titre. Cite les fiches par leur nom exact (le panneau en fait des liens). Quand tu ne sais pas, dis-le et dis où regarder.`
}

export type StopReason = "budget" | "steps"

export interface CopilotSetup {
  agent: ToolLoopAgent<never, ToolSet>
  tools: ToolSet
  model: string
  /** The model and its fallbacks: the one that answered is billed. */
  candidates: string[]
  prices: Record<string, ModelPrice>
  /** Why the turn stopped before the model was done, once it ends. */
  stopped: (steps: readonly StepResult<ToolSet>[]) => StopReason | null
  /** Whether the run can pay for a short answer to these messages. */
  fits: (messages: readonly ModelMessage[]) => Promise<boolean>
}

/** Estimated input of a step: instructions, tools, and the messages so far. */
const inputTokensOf = (system: string, messages: readonly ModelMessage[]) => estimateTokens(system) + TOOLS_TOKENS + estimateTokens(JSON.stringify(messages))

/**
 * The agent for one turn, billed to `run`. Each step's answer is capped from what the run can still pay at the worst
 * price of the model and its fallbacks; the turn stops when even a short answer would not fit.
 */
export async function copilotAgent(user: CurrentUser, run: RunContext, deps: ModelDeps = {}): Promise<CopilotSetup> {
  const [runtime, settings, prices] = await Promise.all([agentRuntime(run), getAiSettings(run.workspaceId), deps.prices ?? priceTable()])
  const role = runtime.agent.modelRole === "decision" ? "writer" : runtime.agent.modelRole
  const { model, fallbacks } = resolveRole(role, settings.roleModels)
  const worst = worstPrice([model, ...fallbacks], prices)
  const system = `${runtime.system}\n\n${copilotRules(user)}`
  const { tools, toolApproval } = chatTools(toolsFor(user, { skills: runtime.tools.length > 0 }), { run })
  const maxSteps = runtime.agent.maxSteps
  let overBudget = false
  /** Input of the step that just ran: the next one reads it again, plus what the step added. */
  let lastInput = 0

  const agent = new ToolLoopAgent<never, ToolSet>({
    model: (deps.languageModel ? deps.languageModel(model) : model) as LanguageModel,
    instructions: system,
    tools,
    toolApproval,
    reasoning: "low",
    providerOptions: gatewayOptions({ models: fallbacks, userKey: run.userKey, agentId: run.agentId }),
    prepareStep: async ({ messages }) => {
      lastInput = inputTokensOf(system, messages)
      const room = maxOutputTokensWithin(worst, await remainingMicros(run.id), lastInput, settings.eurPerUsd)
      return { maxOutputTokens: Math.max(Math.min(STEP_OUTPUT_TOKENS, room), MIN_OUTPUT_TOKENS) }
    },
    stopWhen: [
      stepCountIs(maxSteps),
      async ({ steps }) => {
        const last = steps.at(-1)
        if (!last?.toolCalls.length) return false
        const next = lastInput + estimateTokens(JSON.stringify(last.content))
        overBudget = maxOutputTokensWithin(worst, await remainingMicros(run.id), next, settings.eurPerUsd) < MIN_OUTPUT_TOKENS
        return overBudget
      },
    ],
  })

  const stopped = (steps: readonly StepResult<ToolSet>[]): StopReason | null => {
    if (overBudget) return "budget"
    const last = steps.at(-1)
    // Still calling tools when the steps ran out (a call waiting for approval ends the turn on purpose).
    return last && steps.length >= maxSteps && last.finishReason === "tool-calls" && last.toolResults.length > 0 ? "steps" : null
  }
  const fits = async (messages: readonly ModelMessage[]) => maxOutputTokensWithin(worst, await remainingMicros(run.id), inputTokensOf(system, messages), settings.eurPerUsd) >= MIN_OUTPUT_TOKENS
  return { agent, tools, model, candidates: [model, ...fallbacks], prices, stopped, fits }
}

/** Bills one finished step to the run: its usage and model, with a short trace (never the whole prompt). */
export async function billStep(run: RunContext, step: StepResult<ToolSet>, setup: Pick<CopilotSetup, "candidates" | "prices">): Promise<number> {
  const reported = step.response?.modelId
  const served = reported && setup.candidates.includes(reported) ? reported : setup.candidates[0]
  const gateway = (step.providerMetadata as Record<string, Record<string, unknown>> | undefined)?.gateway
  const { costMicros } = await recordModelStep(run, {
    type: "MODEL",
    name: `copilote-etape-${step.stepNumber + 1}`,
    model: served,
    usage: tokenUsage(step.usage),
    durationMs: 0,
    input: { step: step.stepNumber + 1 },
    output: { text: step.text.slice(0, 1_500), tools: step.toolCalls.map((c) => c.toolName), finishReason: step.finishReason },
    generationId: typeof gateway?.generationId === "string" ? gateway.generationId : null,
    prices: setup.prices,
  })
  return costMicros
}
