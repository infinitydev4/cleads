import { z } from "zod"
import type { AgentDefinition, Prisma, SkillMode } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { getAiSettings, microsToEur, eurToMicros } from "@/lib/ai/budget"
import { AI_ROLES, ROLES, modelLabel, resolveRole, type AiRole } from "@/lib/ai/models"
import { evidenceSummary, requireEvidence } from "@/features/quality/gate"
import { isSuiteId } from "@/features/quality/labels"
import { AGENTS, AGENT_IDS, usesSkills, type AgentDef, type AgentId } from "./agents"

/**
 * The workspace's layer over each agent (docs/crm-v1/AGENTS-IA.md §7): team instructions and skills (owners and
 * managers, skill:manage), and a model role, lower limits and an on/off switch (owner, ai:manage). It only ever adds to
 * the code or narrows it: the persona stays, the limits never go above the code's. Every saved change is a version.
 */
type Db = Prisma.TransactionClient | typeof prisma

export interface EffectiveAgent {
  def: Readonly<AgentDef>
  modelRole: AiRole
  maxSteps: number
  /** Budget reserved for one run, in micro-euros. */
  capMicros: number
  instructions: string | null
  enabled: boolean
  version: number
}

const codeCapMicros = (def: AgentDef) => eurToMicros(def.limits.maxCostEur)

/** The code's agent with the workspace's layer; anything out of bounds in the row falls back to the code. */
export function mergeAgent(def: Readonly<AgentDef>, row: Pick<AgentDefinition, "instructions" | "modelRole" | "maxSteps" | "maxCostMicros" | "enabled" | "version"> | null): EffectiveAgent {
  const modelRole = row?.modelRole && (def.modelRoles as readonly string[]).includes(row.modelRole) ? (row.modelRole as AiRole) : def.modelRole
  return {
    def,
    modelRole,
    maxSteps: Math.min(row?.maxSteps ?? def.limits.maxSteps, def.limits.maxSteps),
    capMicros: Math.min(row?.maxCostMicros ?? codeCapMicros(def), codeCapMicros(def)),
    instructions: row?.instructions?.trim() || null,
    enabled: row?.enabled ?? true,
    version: row?.version ?? 0,
  }
}

export async function effectiveAgent(workspaceId: string, agentId: AgentId, db: Db = prisma): Promise<EffectiveAgent> {
  return mergeAgent(AGENTS[agentId], await db.agentDefinition.findUnique({ where: { workspaceId_agentId: { workspaceId, agentId } } }))
}

export interface AgentSkillLink {
  skillId: string
  name: string
  mode: SkillMode
  archived: boolean
}

export interface AgentHistoryLine {
  version: number
  changes: string[]
  createdAt: string
  createdBy: string | null
}

export interface AgentView {
  id: AgentId
  label: string
  mission: string
  persona: string
  available: boolean
  output: string
  approval: string
  tools: string[]
  usesSkills: boolean
  modelRole: AiRole
  modelRoleLabel: string
  model: string
  modelRoles: { id: AiRole; label: string; model: string }[]
  maxSteps: number
  maxCostEur: number
  codeLimits: { maxSteps: number; maxCostEur: number }
  instructions: string | null
  enabled: boolean
  version: number
  updatedAt: string | null
  updatedBy: string | null
  skills: AgentSkillLink[]
  history: AgentHistoryLine[]
}

export interface AgentsPage {
  agents: AgentView[]
  /** Team instructions and skills. */
  canEditInstructions: boolean
  /** Model role, limits, on/off. */
  canEditSettings: boolean
}

async function names(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  if (!unique.length) return new Map()
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } })
  return new Map(users.map((u) => [u.id, u.name ?? u.email ?? "Membre"]))
}

export async function agentViews(actor: CurrentUser): Promise<AgentsPage> {
  if (!can(actor.role, "ai:use")) throw new LeadError("forbidden", "Accès refusé", 403)
  const [settings, rows, links] = await Promise.all([
    getAiSettings(actor.workspaceId),
    prisma.agentDefinition.findMany({ where: { workspaceId: actor.workspaceId }, include: { versions: { orderBy: { version: "desc" }, take: 10 } } }),
    prisma.agentSkill.findMany({ where: { workspaceId: actor.workspaceId }, select: { agentId: true, skillId: true, mode: true, skill: { select: { name: true, archivedAt: true } } }, orderBy: { skill: { name: "asc" } } }),
  ])
  const byAgent = new Map(rows.map((r) => [r.agentId, r]))
  const people = await names(rows.flatMap((r) => [r.updatedById, ...r.versions.map((v) => v.createdById)]))
  const who = (id: string | null) => (id ? (people.get(id) ?? "Ancien membre") : null)
  return {
    canEditInstructions: can(actor.role, "skill:manage"),
    canEditSettings: can(actor.role, "ai:manage"),
    agents: AGENT_IDS.map((id) => {
      const def = AGENTS[id]
      const row = byAgent.get(id) ?? null
      const eff = mergeAgent(def, row)
      return {
        id,
        label: def.label,
        mission: def.mission,
        persona: def.persona,
        available: def.available,
        output: def.output,
        approval: def.approval,
        tools: [...def.tools],
        usesSkills: usesSkills(def),
        modelRole: eff.modelRole,
        modelRoleLabel: ROLES[eff.modelRole].label,
        model: modelLabel(resolveRole(eff.modelRole, settings.roleModels).model),
        modelRoles: def.modelRoles.map((r) => ({ id: r, label: ROLES[r].label, model: modelLabel(resolveRole(r, settings.roleModels).model) })),
        maxSteps: eff.maxSteps,
        maxCostEur: microsToEur(eff.capMicros),
        codeLimits: { ...def.limits },
        instructions: eff.instructions,
        enabled: eff.enabled,
        version: eff.version,
        updatedAt: row && row.version > 0 ? row.updatedAt.toISOString() : null,
        updatedBy: row && row.version > 0 ? who(row.updatedById) : null,
        skills: links.filter((l) => l.agentId === id).map((l) => ({ skillId: l.skillId, name: l.skill.name, mode: l.mode, archived: !!l.skill.archivedAt })),
        history: (row?.versions ?? []).map((v) => ({ version: v.version, changes: v.changes, createdAt: v.createdAt.toISOString(), createdBy: who(v.createdById) })),
      }
    }),
  }
}

export const updateAgentSchema = z
  .object({
    instructions: z.string().trim().max(4_000, "Consignes : 4 000 caractères au plus").nullable().optional(),
    skills: z
      .array(z.object({ skillId: z.string().min(1), mode: z.enum(["ALWAYS", "ON_DEMAND"]) }))
      .max(40, "40 skills au plus par agent")
      .refine((list) => new Set(list.map((s) => s.skillId)).size === list.length, "Un skill est donné deux fois")
      .optional(),
    modelRole: z.enum(AI_ROLES).optional(),
    maxSteps: z.number().int().min(1, "Une étape au moins").nullable().optional(),
    maxCostEur: z.number().positive("Un plafond positif").nullable().optional(),
    enabled: z.boolean().optional(),
    /** A role whose model scored below the current one in its evaluation, chosen knowingly (E27). */
    acceptRegression: z.boolean().optional(),
  })
  .strict()
  .refine(({ acceptRegression: _, ...v }) => Object.values(v).some((x) => x !== undefined), { message: "Aucun changement demandé" })
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>

interface Snapshot {
  instructions: string | null
  modelRole: string | null
  maxSteps: number | null
  maxCostMicros: number | null
  enabled: boolean
  skills: { name: string; mode: SkillMode }[]
}

/**
 * Saves the layer of one agent. Each part needs its own right; values outside the agent's bounds are refused with a
 * readable message instead of being clipped silently. Nothing changed: no new version.
 */
export async function updateAgentDefinition(actor: CurrentUser, agentId: AgentId, input: UpdateAgentInput, ip?: string | null): Promise<AgentView> {
  const def = AGENTS[agentId]
  const wantsInstructions = input.instructions !== undefined || input.skills !== undefined
  const wantsSettings = input.modelRole !== undefined || input.maxSteps !== undefined || input.maxCostEur !== undefined || input.enabled !== undefined
  if (wantsInstructions && !can(actor.role, "skill:manage")) throw new LeadError("forbidden", "Seuls le propriétaire et les managers changent les consignes et les skills d'un agent.", 403)
  if (wantsSettings && !can(actor.role, "ai:manage")) throw new LeadError("forbidden", "Seul le propriétaire change le modèle, les limites ou l'activation d'un agent.", 403)
  if (input.modelRole && !def.modelRoles.includes(input.modelRole)) throw new LeadError("invalid", `${def.label} ne peut pas utiliser le rôle « ${ROLES[input.modelRole].label} ».`, 400)
  if (input.maxSteps != null && input.maxSteps > def.limits.maxSteps) throw new LeadError("invalid", `${def.label} : ${def.limits.maxSteps} étapes au plus.`, 400)
  if (input.maxCostEur != null && eurToMicros(input.maxCostEur) > codeCapMicros(def)) {
    throw new LeadError("invalid", `${def.label} : ${def.limits.maxCostEur.toLocaleString("fr-FR")} € au plus par exécution.`, 400)
  }
  if (input.skills?.length && !usesSkills(def)) throw new LeadError("invalid", `${def.label} décide sans consignes écrites : il n'utilise pas de skills.`, 400)
  // Another model for an agent that has an evaluation suite needs that model measured on it (E27).
  let evidence: ReturnType<typeof evidenceSummary> | null = null
  if (input.modelRole !== undefined && input.modelRole !== def.modelRole && isSuiteId(agentId)) {
    const [current, settings] = await Promise.all([effectiveAgent(actor.workspaceId, agentId), getAiSettings(actor.workspaceId)])
    const model = resolveRole(input.modelRole, settings.roleModels).model
    if (input.modelRole !== current.modelRole && model !== resolveRole(current.modelRole, settings.roleModels).model) {
      const proof = await requireEvidence(actor.workspaceId, { role: current.modelRole, model, suites: [agentId], what: `faire travailler ${def.label} avec ${modelLabel(model)}` }, !!input.acceptRegression)
      evidence = evidenceSummary(proof)
    }
  }
  if (input.skills?.length) {
    const found = await prisma.skill.count({ where: { workspaceId: actor.workspaceId, id: { in: input.skills.map((s) => s.skillId) }, archivedAt: null } })
    if (found !== input.skills.length) throw new LeadError("invalid", "Un des skills choisis n'existe pas ou est archivé.", 400)
  }

  const changes = await prisma.$transaction(async (tx) => {
    await tx.agentDefinition.createMany({ data: [{ workspaceId: actor.workspaceId, agentId }], skipDuplicates: true })
    // Locks the row: two saves of the same agent are written one after the other.
    await tx.$queryRaw`SELECT 1 FROM "AgentDefinition" WHERE "workspaceId" = ${actor.workspaceId} AND "agentId" = ${agentId} FOR UPDATE`
    const before = await tx.agentDefinition.findUniqueOrThrow({ where: { workspaceId_agentId: { workspaceId: actor.workspaceId, agentId } } })
    const beforeSkills = await tx.agentSkill.findMany({ where: { workspaceId: actor.workspaceId, agentId }, select: { skillId: true, mode: true } })
    const changed: string[] = []
    const data: Prisma.AgentDefinitionUpdateInput = {}
    if (input.instructions !== undefined && (input.instructions || null) !== (before.instructions || null)) {
      data.instructions = input.instructions || null
      changed.push("instructions")
    }
    if (input.modelRole !== undefined) {
      const role = input.modelRole === def.modelRole ? null : input.modelRole
      if (role !== before.modelRole) {
        data.modelRole = role
        changed.push("model")
      }
    }
    const steps = input.maxSteps === undefined ? before.maxSteps : input.maxSteps === def.limits.maxSteps ? null : input.maxSteps
    const cap = input.maxCostEur === undefined ? before.maxCostMicros : input.maxCostEur === null || eurToMicros(input.maxCostEur) === codeCapMicros(def) ? null : eurToMicros(input.maxCostEur)
    if (steps !== before.maxSteps || cap !== before.maxCostMicros) {
      data.maxSteps = steps
      data.maxCostMicros = cap
      changed.push("limits")
    }
    if (input.enabled !== undefined && input.enabled !== before.enabled) {
      data.enabled = input.enabled
      changed.push("enabled")
    }
    if (input.skills !== undefined) {
      const key = (l: { skillId: string; mode: SkillMode }[]) =>
        l
          .map((s) => `${s.skillId}:${s.mode}`)
          .sort()
          .join(",")
      if (key(input.skills) !== key(beforeSkills)) {
        await tx.agentSkill.deleteMany({ where: { workspaceId: actor.workspaceId, agentId } })
        await tx.agentSkill.createMany({ data: input.skills.map((s) => ({ workspaceId: actor.workspaceId, agentId, skillId: s.skillId, mode: s.mode })) })
        changed.push("skills")
      }
    }
    if (!changed.length) return changed
    const after = await tx.agentDefinition.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 }, updatedById: actor.id } })
    const skills = await tx.agentSkill.findMany({ where: { workspaceId: actor.workspaceId, agentId }, select: { mode: true, skill: { select: { name: true } } }, orderBy: { skill: { name: "asc" } } })
    const snapshot: Snapshot = {
      instructions: after.instructions,
      modelRole: after.modelRole,
      maxSteps: after.maxSteps,
      maxCostMicros: after.maxCostMicros,
      enabled: after.enabled,
      skills: skills.map((s) => ({ name: s.skill.name, mode: s.mode })),
    }
    await tx.agentDefinitionVersion.create({ data: { definitionId: after.id, version: after.version, snapshot: snapshot as unknown as Prisma.InputJsonValue, changes: changed, createdById: actor.id } })
    return changed
  })
  if (changes.length) {
    await audit({ action: "ai.agent_updated", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "AgentDefinition", entityId: agentId, metadata: { agentId, changes, ...(evidence && changes.includes("model") ? { evidence } : {}) }, ip })
  }
  const page = await agentViews(actor)
  return page.agents.find((a) => a.id === agentId)!
}
