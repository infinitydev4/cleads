import { z } from "zod"

/**
 * Models per role (docs/crm-v1/AGENTS-IA.md §5). Business code asks for a role, never for a model: the owner changes the
 * model of a role in Réglages › IA, among the role's allow list, without touching the code. Ids are AI Gateway ids.
 */
export const AI_ROLES = ["decision", "fast", "writer", "designer"] as const
export type AiRole = (typeof AI_ROLES)[number]

export interface RoleDef {
  label: string
  description: string
  /** Decision models answer typed questions with probabilities (`experimental_decide`); language models write. */
  kind: "decision" | "language"
  default: string
  /** Tried in order by the Gateway when the model fails. For decisions the first one also reruns an uncertain answer. */
  fallbacks: readonly string[]
  /** What the owner may choose for this role. */
  choices: readonly string[]
}

export const ROLES: Record<AiRole, RoleDef> = {
  decision: {
    label: "Décider",
    description: "Classer, noter ou aiguiller avec une probabilité : pertinence d'un import, classement d'une réponse, prochaine action.",
    kind: "decision",
    default: "typesafe-ai/jev",
    // A conditional Gateway fallback must itself be a decision model.
    fallbacks: ["openai/gpt-6-luna-decisions"],
    choices: ["typesafe-ai/jev", "openai/gpt-6-luna-decisions", "perplexity/pplx-decider-v1.2"],
  },
  fast: {
    label: "Traiter en volume",
    description: "Extraire le contenu d'un site, résumer, vérifier : beaucoup d'appels courts.",
    kind: "language",
    default: "anthropic/claude-haiku-5.5",
    fallbacks: ["openai/gpt-6-luna", "mistral/mistral-small"],
    choices: ["anthropic/claude-haiku-5.5", "openai/gpt-6-luna", "mistral/mistral-small", "google/gemini-3.1-flash-lite"],
  },
  writer: {
    label: "Rédiger et analyser",
    description: "Emails, pitch, analyse d'un audit et de ses captures, copilote.",
    kind: "language",
    default: "anthropic/claude-sonnet-5.5",
    fallbacks: ["openai/gpt-6.1-sol", "mistral/mistral-large-4"],
    choices: ["anthropic/claude-sonnet-5.5", "openai/gpt-6.1-sol", "mistral/mistral-large-4", "google/gemini-4-argon"],
  },
  designer: {
    label: "Créer",
    description: "Maquettes du Studio Web et audits approfondis demandés explicitement.",
    kind: "language",
    default: "anthropic/claude-opus-5.5",
    fallbacks: ["google/gemini-4-argon", "openai/gpt-6-astra"],
    choices: ["anthropic/claude-opus-5.5", "anthropic/claude-sonnet-5.5", "google/gemini-4-argon", "openai/gpt-6-astra"],
  },
}

export const MODEL_LABELS: Record<string, string> = {
  "typesafe-ai/jev": "Jev (TypeSafe AI)",
  "openai/gpt-6-luna-decisions": "GPT-6 Luna Decisions",
  "perplexity/pplx-decider-v1.2": "Perplexity Decider 1.2",
  "anthropic/claude-haiku-5.5": "Claude Haiku 5.5",
  "openai/gpt-6-luna": "GPT-6 Luna",
  "mistral/mistral-small": "Mistral Small",
  "google/gemini-3.1-flash-lite": "Gemini 3.1 Flash-Lite",
  "anthropic/claude-sonnet-5.5": "Claude Sonnet 5.5",
  "openai/gpt-6.1-sol": "GPT-6.1 Sol",
  "mistral/mistral-large-4": "Mistral Large 4",
  "google/gemini-4-argon": "Gemini 4 Argon",
  "anthropic/claude-opus-5.5": "Claude Opus 5.5",
  "openai/gpt-6-astra": "GPT-6 Astra",
  // E30: web searches the Gateway runs for a model, billed per search (lib/ai/pricing.ts).
  "exa/search": "Recherches Exa",
  "perplexity/search": "Recherches Perplexity",
}

export const modelLabel = (id: string) => MODEL_LABELS[id] ?? id

export type RoleModels = Partial<Record<AiRole, string>>

/** Stored overrides, minus anything outside a role's allow list: an old or tampered value falls back to the default. */
export function parseRoleModels(value: unknown): RoleModels {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: RoleModels = {}
  for (const role of AI_ROLES) {
    const id = (value as Record<string, unknown>)[role]
    if (typeof id === "string" && ROLES[role].choices.includes(id)) out[role] = id
  }
  return out
}

export interface ResolvedModel {
  role: AiRole
  model: string
  fallbacks: string[]
}

/** The model a role uses, and its Gateway fallbacks; the role's default comes first when the owner chose another model. */
export function resolveRole(role: AiRole, overrides: RoleModels = {}): ResolvedModel {
  const def = ROLES[role]
  const model = overrides[role] ?? def.default
  const fallbacks = [...new Set([def.default, ...def.fallbacks])].filter((m) => m !== model)
  return { role, model, fallbacks }
}

const choice = (role: AiRole) =>
  z.string().refine((id) => ROLES[role].choices.includes(id), `Modèle non autorisé pour « ${ROLES[role].label} »`)

/** An update from the settings screen: unknown roles or models are refused with a readable message. */
export const roleModelsSchema = z
  .object({ decision: choice("decision").optional(), fast: choice("fast").optional(), writer: choice("writer").optional(), designer: choice("designer").optional() })
  .strict()
