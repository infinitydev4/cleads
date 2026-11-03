import { AGENTS } from "@/features/ai/agents"
import type { AiRole } from "@/lib/ai/models"
import { SUITE_IDS, type SuiteId } from "./labels"

/**
 * Which roles each suite exercises (E27), from the role its agent works with: light on purpose, so the settings and the
 * agents' definitions can ask which evaluations a change of model needs without loading the reference sets.
 */
export const SUITE_ROLES: Record<SuiteId, (agentRole: AiRole) => AiRole[]> = {
  // The audit reads the pages with the fast model, then analyses with its own.
  auditor: (agentRole) => [...new Set<AiRole>([agentRole, "fast"])],
  offers: (agentRole) => [agentRole],
  writer: (agentRole) => [agentRole],
  replies: () => ["decision"],
  qualifier: () => ["decision"],
  designer: (agentRole) => [agentRole],
}

/** The role the code gives the suite's agent, before any change in Agents IA. */
export const defaultRole = (id: SuiteId): AiRole => AGENTS[id].modelRole

/** The suites a change of this role's model touches, given the role each agent works with in the workspace. */
export function suitesUsing(role: AiRole, agentRoles: Partial<Record<SuiteId, AiRole>>): SuiteId[] {
  return SUITE_IDS.filter((id) => SUITE_ROLES[id](agentRoles[id] ?? defaultRole(id)).includes(role))
}
