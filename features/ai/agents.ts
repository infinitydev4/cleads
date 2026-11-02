import type { AiRole } from "@/lib/ai/models"

/**
 * The agents of the AI agency (docs/crm-v1/AGENTS-IA.md §7). E17 fixes who they are, which model role they use and what
 * one run may cost; their instructions, tools and skills arrive with their epics (E19 to E25).
 */
export const AGENT_IDS = ["auditor", "offers", "writer", "replies", "designer", "copilot", "strategist", "qualifier"] as const
export type AgentId = (typeof AGENT_IDS)[number]

export interface AgentDef {
  id: AgentId
  label: string
  mission: string
  modelRole: AiRole
  /** Epic that gives the agent its behaviour. */
  epic: string
  limits: {
    /** Model calls and tool calls in one run. */
    maxSteps: number
    /** Budget reserved for one run (D22). */
    maxCostEur: number
  }
}

/** Checks an agent's settings once, at load. */
export function defineAgent(def: AgentDef): Readonly<AgentDef> {
  if (!def.label.trim() || !def.mission.trim()) throw new Error(`Agent ${def.id} : nom et mission obligatoires`)
  if (!Number.isInteger(def.limits.maxSteps) || def.limits.maxSteps < 1 || def.limits.maxSteps > 50) throw new Error(`Agent ${def.id} : 1 à 50 étapes`)
  if (!(def.limits.maxCostEur > 0 && def.limits.maxCostEur <= 5)) throw new Error(`Agent ${def.id} : plafond par exécution entre 0 et 5 €`)
  return Object.freeze({ ...def, limits: Object.freeze({ ...def.limits }) })
}

export const AGENTS: Record<AgentId, Readonly<AgentDef>> = {
  auditor: defineAgent({
    id: "auditor",
    label: "Auditeur digital",
    mission: "Audite le site et la présence en ligne d'un prospect, chaque constat avec sa preuve.",
    modelRole: "writer",
    epic: "E20",
    limits: { maxSteps: 12, maxCostEur: 0.3 },
  }),
  offers: defineAgent({
    id: "offers",
    label: "Conseiller offres",
    mission: "Relie les faiblesses de l'audit aux offres du catalogue et prépare le pitch du closer.",
    modelRole: "writer",
    epic: "E21",
    limits: { maxSteps: 4, maxCostEur: 0.1 },
  }),
  writer: defineAgent({
    id: "writer",
    label: "Rédacteur outreach",
    mission: "Rédige des emails courts et sourcés, toujours relus avant envoi.",
    modelRole: "writer",
    epic: "E22",
    limits: { maxSteps: 3, maxCostEur: 0.05 },
  }),
  replies: defineAgent({
    id: "replies",
    label: "Analyste réponses",
    mission: "Classe les réponses reçues et leur urgence, avec une probabilité.",
    modelRole: "decision",
    epic: "E22",
    limits: { maxSteps: 1, maxCostEur: 0.01 },
  }),
  designer: defineAgent({
    id: "designer",
    label: "Designer web",
    mission: "Génère une landing de démonstration à partir du site, de l'audit et de la charte du prospect.",
    modelRole: "designer",
    epic: "E23",
    limits: { maxSteps: 8, maxCostEur: 2 },
  }),
  copilot: defineAgent({
    id: "copilot",
    label: "Copilote",
    mission: "Répond sur les données du CRM que la personne voit et délègue aux autres agents.",
    modelRole: "writer",
    epic: "E24",
    limits: { maxSteps: 6, maxCostEur: 0.1 },
  }),
  strategist: defineAgent({
    id: "strategist",
    label: "Stratège marché",
    mission: "Propose les secteurs à cibler selon les offres et prépare campagnes et recherches.",
    modelRole: "writer",
    epic: "E25",
    limits: { maxSteps: 10, maxCostEur: 0.3 },
  }),
  qualifier: defineAgent({
    id: "qualifier",
    label: "Analyste qualification",
    mission: "Trie les fiches importées selon leur pertinence pour une campagne ou une offre.",
    modelRole: "decision",
    epic: "E25",
    limits: { maxSteps: 1, maxCostEur: 0.01 },
  }),
}

export const isAgentId = (value: unknown): value is AgentId => typeof value === "string" && (AGENT_IDS as readonly string[]).includes(value)
export const agentLabel = (id: string) => (isAgentId(id) ? AGENTS[id].label : id)
export const agentCapMicros = (id: AgentId) => Math.round(AGENTS[id].limits.maxCostEur * 1_000_000)
