import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { AGENTS, type AgentDef } from "@/features/ai/agents"
import { ACTION_FAMILIES, FAMILY_INFO, FAMILY_MODES, allowedModes, type ActionFamily, type FamilyMode } from "@/features/ai/actions/families"
import { effectivePolicy, storedPolicy, type AgentPolicy } from "@/features/ai/actions/policy"
import { MCP_AGENT, MCP_LABEL } from "./names"

/**
 * The MCP clients in the agents' rights matrix (E29, D38): the copilot's families at the copilot's levels (D28) to begin
 * with, which the owner sets apart in Agents IA › Droits. Like any agent's row, it only narrows what the token's member
 * may do (lib/rbac.ts), never lowers an action's own level, and what contacts a prospect keeps its own click.
 */
export const MCP_CLIENTS: Pick<AgentDef, "families" | "picksTools"> = { families: AGENTS.copilot.families, picksTools: true }

export interface McpAccess {
  /** D39: the server answers this workspace's tokens only once the owner switched it on. */
  enabled: boolean
  policy: AgentPolicy
}

export async function mcpAccess(workspaceId: string): Promise<McpAccess> {
  const s = await prisma.aiSetting.findUnique({ where: { workspaceId }, select: { mcpEnabled: true, mcpPolicy: true } })
  return { enabled: !!s?.mcpEnabled, policy: effectivePolicy(MCP_CLIENTS, s?.mcpPolicy ?? null) }
}

/** The row Agents IA › Droits shows, in the shape of an agent's families. */
export interface McpRightsView {
  id: typeof MCP_AGENT
  label: string
  picksTools: true
  enabled: boolean
  families: { id: ActionFamily; label: string; hint: string; mode: FamilyMode; codeMode: FamilyMode; modes: FamilyMode[] }[]
}

export function rightsView(access: McpAccess): McpRightsView {
  return {
    id: MCP_AGENT,
    label: MCP_LABEL,
    picksTools: true,
    enabled: access.enabled,
    families: ACTION_FAMILIES.filter((f) => MCP_CLIENTS.families[f]).map((f) => ({
      id: f,
      label: FAMILY_INFO[f].label,
      hint: FAMILY_INFO[f].hint,
      mode: access.policy[f] ?? "off",
      codeMode: MCP_CLIENTS.families[f]!,
      modes: allowedModes(f, true),
    })),
  }
}

export const updateMcpSchema = z
  .object({
    /** D39: MCP for the whole workspace. */
    enabled: z.boolean().optional(),
    /** D38: the MCP clients' rights matrix, family by family. */
    actionPolicy: z.partialRecord(z.enum(ACTION_FAMILIES), z.enum(FAMILY_MODES)).optional(),
  })
  .strict()
  .refine((v) => v.enabled !== undefined || v.actionPolicy !== undefined, { message: "Aucun changement demandé" })
export type UpdateMcpInput = z.infer<typeof updateMcpSchema>

/**
 * The owner switches MCP on or off for the workspace and sets the MCP clients' row of the matrix. Both are journaled; a
 * change of rights keeps the before and the after. Switching it off stops every token at once without deleting them.
 */
export async function updateMcpAccess(actor: CurrentUser, input: UpdateMcpInput, ip?: string | null): Promise<McpRightsView> {
  if (!can(actor.role, "ai:manage")) throw new LeadError("forbidden", "Seul le propriétaire ouvre l'accès MCP et règle ses droits.", 403)
  for (const [family, mode] of Object.entries(input.actionPolicy ?? {}) as [ActionFamily, FamilyMode][]) {
    if (!MCP_CLIENTS.families[family]) throw new LeadError("invalid", `${MCP_LABEL} : « ${FAMILY_INFO[family].label} » n'est pas ouverte aux clients MCP.`, 400)
    if (!allowedModes(family, true).includes(mode)) throw new LeadError("invalid", `${MCP_LABEL} : « ${FAMILY_INFO[family].label} » ne peut pas passer sans clic.`, 400)
  }
  const before = await prisma.aiSetting.findUnique({ where: { workspaceId: actor.workspaceId }, select: { mcpEnabled: true, mcpPolicy: true } })
  const data: Prisma.AiSettingUncheckedUpdateInput = { updatedById: actor.id }
  let rights: { before: unknown; after: unknown } | null = null
  if (input.actionPolicy !== undefined) {
    const policy = storedPolicy(MCP_CLIENTS, { ...effectivePolicy(MCP_CLIENTS, before?.mcpPolicy ?? null), ...input.actionPolicy })
    if (JSON.stringify(policy) !== JSON.stringify(before?.mcpPolicy ?? null)) {
      data.mcpPolicy = policy ?? Prisma.DbNull
      rights = { before: before?.mcpPolicy ?? null, after: policy }
    }
  }
  const switched = input.enabled !== undefined && input.enabled !== !!before?.mcpEnabled
  if (switched) data.mcpEnabled = input.enabled
  if (switched || rights) {
    await prisma.aiSetting.upsert({
      where: { workspaceId: actor.workspaceId },
      create: { workspaceId: actor.workspaceId, updatedById: actor.id, mcpEnabled: !!data.mcpEnabled, ...(rights ? { mcpPolicy: data.mcpPolicy as Prisma.InputJsonValue } : {}) },
      update: data,
    })
  }
  if (switched) await audit({ action: input.enabled ? "mcp.enabled" : "mcp.disabled", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "AiSetting", entityId: actor.workspaceId, ip })
  if (rights) await audit({ action: "mcp.policy_changed", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "AiSetting", entityId: actor.workspaceId, metadata: { rights } as Prisma.InputJsonValue, ip })
  return rightsView(await mcpAccess(actor.workspaceId))
}
