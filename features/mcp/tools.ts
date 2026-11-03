import { asSchema, type JSONSchema7 } from "ai"
import { z } from "zod"
import type { CrmRole } from "@/lib/crm/roles"
import { can } from "@/lib/rbac"
import { ACTIONS } from "@/features/ai/actions/catalog"
import { FAMILY_INFO, type ActionFamily } from "@/features/ai/actions/families"
import type { AgentPolicy } from "@/features/ai/actions/policy"
import { idOf, personOf } from "@/features/ai/actions/shared"
import { approvalOf, defineTool, getTool, isOpen, registerTool, type AnyToolDef, type ToolContext } from "@/features/ai/tools"
import { MCP_LABEL } from "./names"
import { actionStatus, aiWorkStatus, appOrigin } from "./status"

/**
 * The tools the CRM's MCP server publishes (E29, D30): the copilot's catalogue of actions (features/ai/actions/), each
 * with its own schema, right, family and level, plus two reads an outside client needs to follow what it asked for.
 * Nothing is rewritten for MCP: the same definition runs, as the token's member.
 */

export const getActionStatusTool = defineTool({
  name: "get_action_status",
  description:
    "Où en est une action mise en attente de validation dans Cleads (approvalId donné par sa réponse) : en attente, validée et faite (avec son résultat), refusée (avec la note de la personne), expirée ou en échec.",
  permission: "ai:read",
  approval: "auto",
  costClass: "free",
  family: "read_crm",
  input: z.object({ approvalId: idOf("de la validation (approvalId)") }),
  execute: (ctx, input) => actionStatus(personOf(ctx), input.approvalId),
})

export const getRunStatusTool = defineTool({
  name: "get_run_status",
  description:
    "Où en est un travail d'IA lancé dans Cleads (runId donné par sa réponse : audit, offres, brouillon, maquette, cibles du Stratège, tri) : en file, en cours, terminé ou en échec. Le résultat se lit ensuite avec les lectures du CRM (get_lead_audit, get_lead_offers, get_campaign_sorting…).",
  permission: "ai:read",
  approval: "auto",
  costClass: "free",
  family: "read_crm",
  input: z.object({ runId: idOf("de l'exécution (runId)") }),
  execute: (ctx, input) => aiWorkStatus(personOf(ctx), input.runId),
})

/** The catalogue as MCP publishes it, in its order: every action but the copilot's own skills, then MCP's two reads. */
export const MCP_TOOLS: readonly AnyToolDef[] = [...ACTIONS.filter((d) => d.name !== "read_skill"), getActionStatusTool, getRunStatusTool]

/** An approved call runs by name (executeApprovedCalls): the process that runs it must know MCP's tools. */
export function registerMcpTools(): void {
  for (const def of MCP_TOOLS) if (getTool(def.name) !== def) registerTool(def)
}

export const toolByName = (name: string) => MCP_TOOLS.find((d) => d.name === name) ?? null

/** What a read-only token reaches: reading and opening pages. */
export const READ_ONLY_FAMILIES: ReadonlySet<ActionFamily> = new Set(["read_crm", "read_web", "navigation"])
const OPEN_WORLD: ReadonlySet<ActionFamily> = new Set(["read_web", "prospecting", "outreach"])

export interface Reach {
  role: CrmRole
  readOnly: boolean
  policy: AgentPolicy
}

/** Why a tool is closed to this token, or null when it is open: the member's right, the MCP clients' row, the token. */
export function refusalOf(def: AnyToolDef, reach: Reach): string | null {
  if (def.family && !isOpen(def, reach.policy)) return `« ${FAMILY_INFO[def.family].label} » est coupée pour les ${MCP_LABEL.toLowerCase()} dans cet espace : le propriétaire la règle dans Agents IA › Agents › Droits.`
  if (def.permission && !can(reach.role, def.permission)) return "Cette action demande un droit que le rôle de la personne n'a pas dans le CRM."
  if (reach.readOnly && !(def.family && READ_ONLY_FAMILIES.has(def.family))) return "Ce jeton est en lecture seule : un jeton « Lecture et actions » se crée dans Réglages › Accès MCP."
  return null
}

/** The tools this token may call, in the catalogue's order: the same list for the same rights. */
export const offeredTools = (reach: Reach): AnyToolDef[] => MCP_TOOLS.filter((d) => refusalOf(d, reach) === null)

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: JSONSchema7
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean }
}

const LEVEL_NOTES = {
  confirm: "Attend la validation de la personne dans Cleads (« À valider ») : la réponse donne un approvalId à suivre avec get_action_status ; ne présente jamais l'action comme faite avant.",
  explicit: "Contacte un prospect : attend toujours son propre clic dans Cleads, qui montre les destinataires ; la réponse donne un approvalId à suivre avec get_action_status.",
} as const

/** A tool as MCP lists it: the catalogue's words and schema, what its validation means here, and hints for the client. */
export async function describeTool(def: AnyToolDef, ctx: ToolContext): Promise<McpToolDefinition> {
  const level = approvalOf(def, ctx)
  const read = !!def.family && READ_ONLY_FAMILIES.has(def.family)
  return {
    name: def.name,
    description: level === "auto" ? def.description : `${def.description}\n${LEVEL_NOTES[level]}`,
    inputSchema: await asSchema(def.input).jsonSchema,
    // Nothing here deletes: the catalogue never offers it (FORBIDDEN_FOR_AGENTS).
    annotations: { readOnlyHint: read, destructiveHint: false, idempotentHint: read, openWorldHint: !!def.family && OPEN_WORLD.has(def.family) },
  }
}

const RUN_NOTE = "Le travail continue dans Cleads, après cette réponse : suis-le avec get_run_status. Ne le présente pas comme terminé."
const MISSION_NOTE = "Plan proposé, pas lancé : la personne le lance dans Cleads (Agents IA › Missions, « À lancer »). Ne le présente pas comme lancé ; dis en une ou deux phrases ce qu'il fera et ce qu'il peut coûter."
const PATH = /^\/app(?:[/?#]|$)/

/**
 * An output as an outside client reads it: what the model reads in the copilot (`forModel`), with absolute links, and
 * the notes that speak of the panel's cards said for a client that has none.
 */
export function forClient(def: AnyToolDef, output: unknown): unknown {
  const origin = appOrigin()
  const adapt = (v: unknown): unknown => {
    if (typeof v === "string") return PATH.test(v) ? `${origin}${v}` : v
    if (Array.isArray(v)) return v.map(adapt)
    if (!v || typeof v !== "object") return v
    const o: Record<string, unknown> = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, adapt(x)]))
    if (o.started === true && typeof o.runId === "string") o.note = RUN_NOTE
    if (o.proposed === true && typeof o.missionId === "string") {
      o.note = MISSION_NOTE
      o.open ??= `${origin}/app/agents?tab=missions`
    }
    return o
  }
  return adapt(def.forModel ? def.forModel(output) : output)
}
