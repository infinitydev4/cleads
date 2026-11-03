import type { AgentDef } from "../agents"
import { allowedModes, type ActionFamily, type ActionPolicy, type FamilyMode } from "./families"

/**
 * An agent's rights matrix (E28, docs/crm-v1/AGENTS-IA.md §12): the families of actions its definition declares, at
 * their code level unless the owner chose otherwise (AgentDefinition.actionPolicy). It only ever narrows what the
 * person the agent works for may do (lib/rbac.ts), and never opens the rights no agent may use (FORBIDDEN_FOR_AGENTS).
 */
export type AgentPolicy = Partial<ActionPolicy>

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

/** The declared families with the workspace's choices; a saved value outside the family's allowed modes is ignored. */
export function effectivePolicy(def: Pick<AgentDef, "families" | "picksTools">, stored: unknown): AgentPolicy {
  const saved = isRecord(stored) ? stored : {}
  const out: AgentPolicy = {}
  for (const [family, mode] of Object.entries(def.families) as [ActionFamily, FamilyMode][]) {
    const wanted = saved[family]
    out[family] = typeof wanted === "string" && allowedModes(family, !!def.picksTools).includes(wanted as FamilyMode) ? (wanted as FamilyMode) : mode
  }
  return out
}

/** A family the agent does not declare is off: an agent only does what its definition says. */
export const modeOf = (policy: AgentPolicy, family: ActionFamily): FamilyMode => policy[family] ?? "off"

/** What is stored: only the families set apart from the code, so a later change of the code's level still applies. */
export function storedPolicy(def: Pick<AgentDef, "families">, policy: AgentPolicy): Record<string, FamilyMode> | null {
  const out: Record<string, FamilyMode> = {}
  for (const [family, mode] of Object.entries(policy) as [ActionFamily, FamilyMode][]) if (def.families[family] && def.families[family] !== mode) out[family] = mode
  return Object.keys(out).length ? out : null
}

/** A specialist's workflow needs every family it declares: one switched off stops its runs. */
export const cutFamilies = (def: Pick<AgentDef, "families">, policy: AgentPolicy): ActionFamily[] =>
  (Object.keys(def.families) as ActionFamily[]).filter((f) => modeOf(policy, f) === "off")
