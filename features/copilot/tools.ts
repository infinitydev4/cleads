import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { AGENTS } from "@/features/ai/agents"
import { ACTIONS } from "@/features/ai/actions/catalog"
import { effectivePolicy, type AgentPolicy } from "@/features/ai/actions/policy"
import { readSkillTool } from "@/features/ai/runtime"
import { isOpen, type AnyToolDef } from "@/features/ai/tools"

/**
 * What the copilot works with (E24, E28, docs/crm-v1/AGENTS-IA.md §17): the catalogue of actions
 * (features/ai/actions/), each calling an existing service as the person the conversation belongs to, so it sees and
 * does exactly what that person may. Reading, navigating and small notes run on their own; other changes wait for the
 * person's click in the conversation; what contacts a prospect always waits for its own click.
 */
export const COPILOT_TOOLS: readonly AnyToolDef[] = ACTIONS

/** The tools the person's role and the copilot's rights matrix allow: the copilot is never offered what it could not do. */
export const toolsFor = (user: Pick<CurrentUser, "role">, opts: { skills: boolean; policy?: AgentPolicy }): AnyToolDef[] => {
  const policy = opts.policy ?? effectivePolicy(AGENTS.copilot, null)
  return COPILOT_TOOLS.filter((t) => (t.name === readSkillTool.name ? opts.skills : isOpen(t, policy) && (!t.permission || can(user.role, t.permission))))
}
