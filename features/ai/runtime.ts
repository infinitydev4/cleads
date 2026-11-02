import { z } from "zod"
import { UNTRUSTED_RULE } from "@/lib/ai/untrusted"
import { ensureAgentCatalog } from "./catalog"
import { effectiveAgent, type EffectiveAgent } from "./definitions"
import type { RunContext } from "./runs"
import { loadAgentSkills, loadSkillsByName, readSkillForAgent, type LoadedSkill } from "./skills/service"
import { defineTool, type AnyToolDef } from "./tools"

/**
 * What an agent works with in a run (docs/crm-v1/AGENTS-IA.md §7 and §8): its instructions, written from its persona,
 * the common rules, the team's instructions and its skills, and the tools it reads skills with. Business handlers
 * (E20 to E25) start from here, so a change made in Agents IA applies to the next run without a deployment.
 */
export const COMMON_RULES = [
  UNTRUSTED_RULE,
  "Chaque affirmation sur un prospect s'appuie sur une preuve (URL, mesure, capture) ; sans preuve, écris ce qu'il faudrait vérifier. N'invente ni chiffre, ni avis, ni référence client.",
  "Tout ce qui sort du CRM (email, recherche, lien envoyé à un prospect) attend la validation d'une personne : ne le présente jamais comme fait.",
  "Réponds en français.",
]

/** Files of an always-on skill are given in full up to this size; past it, the agent reads them with read_skill. */
const INLINE_FILES_MAX = 10_000

export interface SkillSummary {
  name: string
  description: string
}

/**
 * The agent's instructions, always in the same order (cache-friendly): persona, common rules, team instructions,
 * skills always on, then the catalogue of skills read on demand.
 */
export function composeInstructions(agent: Pick<EffectiveAgent, "def" | "instructions">, always: readonly LoadedSkill[], onDemand: readonly SkillSummary[]): string {
  const parts = [agent.def.persona.trim(), `## Règles communes\n${COMMON_RULES.map((r) => `- ${r}`).join("\n")}`]
  if (agent.instructions) parts.push(`## Consignes de l'équipe\nElles complètent ton rôle et ne lèvent aucune des règles communes.\n\n${agent.instructions.trim()}`)
  for (const s of always) {
    let block = `## Skill « ${s.name} » (version ${s.version})\n${s.content.trim()}`
    let size = 0
    for (const f of s.files) {
      if (size + f.content.length > INLINE_FILES_MAX) {
        block += `\n\n(Annexe « ${f.path} » : lis-la avec read_skill si tu en as besoin.)`
        continue
      }
      size += f.content.length
      block += `\n\n### Annexe « ${f.path} »\n${f.content.trim()}`
    }
    parts.push(block)
  }
  if (onDemand.length) {
    parts.push(
      `## Skills à la demande\nCes savoir-faire sont disponibles : appelle l'outil read_skill avec le nom exact de celui dont tu as besoin, avant de t'en servir.\n${onDemand.map((s) => `- \`${s.name}\` : ${s.description}`).join("\n")}`
    )
  }
  return parts.join("\n\n")
}

export const readSkillTool = defineTool({
  name: "read_skill",
  description: "Charge un skill de ton catalogue (ou l'un de ses fichiers annexes) avant de t'en servir. Donne son nom exact, et le chemin de l'annexe si tu en veux une.",
  permission: null,
  approval: "auto",
  costClass: "free",
  input: z.object({ name: z.string().min(1).max(64), file: z.string().max(200).optional() }),
  execute: (ctx, input) => readSkillForAgent(ctx.run.workspaceId, ctx.run.agentId, input.name, input.file),
})

export interface AgentRuntime {
  agent: EffectiveAgent
  system: string
  /** Skills in the instructions, with the version used: recorded with the run's output. */
  skills: { name: string; version: number }[]
  /** read_skill when the agent has skills on demand. */
  tools: AnyToolDef[]
}

export async function agentRuntime(run: Pick<RunContext, "workspaceId" | "agentId">): Promise<AgentRuntime> {
  await ensureAgentCatalog(run.workspaceId)
  const [agent, skills] = await Promise.all([effectiveAgent(run.workspaceId, run.agentId), loadAgentSkills(run.workspaceId, run.agentId)])
  return {
    agent,
    system: composeInstructions(agent, skills.always, skills.onDemand),
    skills: skills.always.map((s) => ({ name: s.name, version: s.version })),
    tools: skills.onDemand.length ? [readSkillTool] : [],
  }
}

/**
 * Instructions for one step of a coded workflow, which calls a model without tools: the skills always on, plus the
 * ones the workflow picks for this step, all written in full (an agent without tools cannot read a catalogue).
 */
export async function workflowInstructions(run: Pick<RunContext, "workspaceId" | "agentId">, pick: readonly string[]): Promise<AgentRuntime> {
  await ensureAgentCatalog(run.workspaceId)
  const [agent, skills, picked] = await Promise.all([effectiveAgent(run.workspaceId, run.agentId), loadAgentSkills(run.workspaceId, run.agentId), loadSkillsByName(run.workspaceId, run.agentId, pick)])
  const all = [...skills.always, ...picked.filter((p) => !skills.always.some((a) => a.name === p.name))]
  return { agent, system: composeInstructions(agent, all, []), skills: all.map((s) => ({ name: s.name, version: s.version })), tools: [] }
}
