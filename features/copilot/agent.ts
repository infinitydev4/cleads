import { ToolLoopAgent, stepCountIs, toolSearch, type LanguageModel, type ModelMessage, type StepResult, type ToolSet } from "ai"
import { z } from "zod"
import type { CurrentUser } from "@/lib/auth/guard"
import { ROLE_LABELS } from "@/lib/crm/roles"
import { gatewayOptions } from "@/lib/ai/gateway"
import { estimateTokens } from "@/lib/ai/pricing"
import type { ModelDeps } from "@/features/ai/calls"
import { loopBudget, type LoopBudget } from "@/features/ai/loop"
import { agentRuntime } from "@/features/ai/runtime"
import type { RunContext } from "@/features/ai/runs"
import { chatTools, type AnyToolDef } from "@/features/ai/tools"
import { AGENTS } from "@/features/ai/agents"
import { CORE_ACTIONS, rankActions } from "@/features/ai/actions/catalog"
import { effectivePolicy } from "@/features/ai/actions/policy"
import { toolsFor } from "./tools"

/**
 * The copilot as an AI SDK agent (E24, E28): its instructions (persona, common rules, team instructions, skills, then
 * how it works here), the actions the person's role and the copilot's rights matrix allow, and the run's limits. The
 * core actions are loaded at every turn, with those the last answer used; the others are found on demand
 * (`find_actions`), so the catalogue's sixty definitions are not paid for at every step. A turn is short: ten steps at
 * most, each one paid for before the next starts, and stopped when the run's cap could not pay for another.
 */

/** Room for one step's answer, reasoning included: a plan of several actions needs a little more than an answer. */
export const STEP_OUTPUT_TOKENS = 3_000
/** The search over the catalogue: what the model calls to find an action it does not have yet. */
export const FIND_ACTIONS = "find_actions"
const FOUND_PER_SEARCH = 8
/** The search tool's own definition, in each request. */
const SEARCH_TOKENS = 300

export function copilotRules(user: Pick<CurrentUser, "role">): string {
  return `## Comment tu travailles ici
- Tu travailles pour la personne connectée (rôle : ${ROLE_LABELS[user.role]}). Tes outils voient et font exactement ce qu'elle peut faire dans le CRM, rien de plus : une fiche introuvable l'est aussi pour elle.
- Chaque question commence par la date et la page ouverte, entre crochets. « Cette fiche », « cette campagne », « la liste » désignent cette page.
- Lis avant de répondre ou d'agir : n'invente ni fiche, ni chiffre, ni date, ni identifiant, ni volume. Retrouve les leadId avec search_leads plutôt que de les deviner.
- Tu as sous la main les outils les plus courants. Pour tout le reste (recherches Extractor, imports, statuts, attributions, campagnes, tâches, séquences, rendez-vous, maquettes, Stratège…), appelle ${FIND_ACTIONS} avec ce que tu veux faire, en quelques mots, puis l'action trouvée.
- Agir pour la personne :
  - lire, ouvrir une page (open_page), noter, enregistrer un appel, gérer une tâche, étiqueter des fiches se fait tout de suite ;
  - les autres changements attendent son clic sur la carte de l'action : propose-les quand ils servent, et ne les annonce jamais comme faits avant leur résultat ;
  - ce qui contacte un prospect (inscription en séquence, rendez-vous, lien de maquette) demande toujours son propre clic, qui montre les destinataires ;
  - une action refusée ne se repropose pas, sauf si elle le redemande ; quand un outil refuse faute de droit, dis-le, et dis où la personne (ou qui) peut le faire.
- Les recherches Extractor, audits, offres, brouillons, maquettes et le Stratège travaillent dans le worker, après ta réponse : une carte en suit l'avancement. Dis ce qui va se passer, pas ce qui s'est passé. Une recherche s'importe une fois terminée, avec import_search.
- Une demande qui enchaîne des actions longues ou en nombre (chercher puis importer, trier, retenir les meilleures fiches, auditer, préparer des emails, inscrire en séquence, ou la même chose chaque semaine) devient une mission : propose_mission, un plan que la personne lance d'un clic et que le worker mène seul, étape par étape. Lis d'abord ce que le plan cite (offres, campagnes, séquences, membres) ; le skill missions-cleads donne les recettes et les ordres de grandeur. Une mission proposée n'est pas lancée ; list_missions dit où en sont les missions.
- Tu ne supprimes, ne fusionnes ni n'exportes rien. Un email isolé se relit et s'envoie depuis la fiche, par la personne.
- Réponds court, en français : quelques phrases ou une liste à puces, sans tableau ni titre. Cite les fiches par leur nom exact (le panneau en fait des liens). Quand tu ne sais pas, dis-le et dis où regarder.`
}

export type StopReason = "budget" | "steps"

export interface CopilotSetup {
  agent: ToolLoopAgent<never, ToolSet>
  tools: ToolSet
  model: string
  /** Why the turn stopped before the model was done, once it ends. */
  stopped: (steps: readonly StepResult<ToolSet>[]) => StopReason | null
  /** Whether the run can pay for a short answer to these messages. */
  fits: LoopBudget["fits"]
  /** Bills a finished step to the turn's run. */
  bill: LoopBudget["bill"]
}

const weights = new Map<string, number>()
/** What an action's description and schema weigh in a request, measured once. */
function weightOf(def: AnyToolDef): number {
  let w = weights.get(def.name)
  if (w === undefined) {
    let schema = ""
    try {
      schema = JSON.stringify(z.toJSONSchema(def.input as z.ZodType, { unrepresentable: "any" }))
    } catch {
      schema = "x".repeat(1_200)
    }
    w = estimateTokens(def.description + schema)
    weights.set(def.name, w)
  }
  return w
}

export interface CopilotOptions {
  /** The actions the last answer used, loaded with the core so the model can carry on with them. */
  recent?: ReadonlySet<string>
  /**
   * An evaluation's frozen CRM (E28 lot 3, features/quality/cases/copilot.ts): each action keeps its definition, so the
   * model reads what it reads in service, but answers from that world; and the rights matrix is the code's, whatever
   * the workspace chose, so the cases' expectations hold everywhere.
   */
  world?: (def: AnyToolDef) => AnyToolDef
}

/**
 * The agent for one turn, billed to `run`. Each step's answer is capped from what the run can still pay at the worst
 * price of the model and its fallbacks; the turn stops when even a short answer would not fit (features/ai/loop.ts).
 */
export async function copilotAgent(user: CurrentUser, run: RunContext, deps: ModelDeps = {}, opts: CopilotOptions = {}): Promise<CopilotSetup> {
  const runtime = await agentRuntime(run)
  const role = runtime.agent.modelRole === "decision" ? "writer" : runtime.agent.modelRole
  const system = `${runtime.system}\n\n${copilotRules(user)}`
  const policy = opts.world ? effectivePolicy(AGENTS.copilot, null) : runtime.agent.policy
  const defs = toolsFor(user, { skills: runtime.tools.length > 0, policy }).map((d) => opts.world?.(d) ?? d)
  const loadedAtStart = (name: string) => CORE_ACTIONS.has(name) || !!opts.recent?.has(name)
  // Loaded now, or named in the conversation (a call, a search result): the most this step's tools can weigh.
  const toolsTokens = (messages: readonly ModelMessage[]) => {
    const text = JSON.stringify(messages)
    return SEARCH_TOKENS + defs.filter((d) => loadedAtStart(d.name) || text.includes(`"${d.name}"`)).reduce((sum, d) => sum + weightOf(d), 0)
  }
  const budget = await loopBudget(run, { role, system, stepTokens: STEP_OUTPUT_TOKENS, toolsTokens, stepName: "copilote-etape" }, deps)
  const built = chatTools(defs, { run, policy })
  const tools: ToolSet = { [FIND_ACTIONS]: toolSearch({ maxResults: FOUND_PER_SEARCH, search: ({ query, tools: candidates }) => rankActions(query, candidates) }) }
  for (const def of defs) tools[def.name] = loadedAtStart(def.name) ? built.tools[def.name] : { ...built.tools[def.name], deferLoading: true }
  const maxSteps = runtime.agent.maxSteps

  const agent = new ToolLoopAgent<never, ToolSet>({
    model: (deps.languageModel ? deps.languageModel(budget.model) : budget.model) as LanguageModel,
    instructions: system,
    tools,
    toolApproval: built.toolApproval,
    reasoning: "low",
    providerOptions: gatewayOptions({ models: budget.fallbacks, userKey: run.userKey, agentId: run.agentId }),
    prepareStep: budget.prepareStep,
    stopWhen: [stepCountIs(maxSteps), budget.overBudget],
  })

  const stopped = (steps: readonly StepResult<ToolSet>[]): StopReason | null => {
    if (budget.stoppedByBudget()) return "budget"
    const last = steps.at(-1)
    // Still calling tools when the steps ran out (a call waiting for approval ends the turn on purpose).
    return last && steps.length >= maxSteps && last.finishReason === "tool-calls" && last.toolResults.length > 0 ? "steps" : null
  }
  return { agent, tools, model: budget.model, stopped, fits: budget.fits, bill: budget.bill }
}
